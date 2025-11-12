const dom = {
  heapView: document.getElementById("heap-view"),
  bumpPointer: document.getElementById("bump-pointer"),
  freeList: document.getElementById("free-list"),
  allocatedList: document.getElementById("allocated-list"),
  logEntries: document.getElementById("log-entries"),
  forms: {
    malloc: document.getElementById("malloc-form"),
    calloc: document.getElementById("calloc-form"),
    free: document.getElementById("free-form"),
    realloc: document.getElementById("realloc-form"),
  },
  inputs: {
    mallocSize: document.getElementById("malloc-size"),
    callocNmemb: document.getElementById("calloc-nmemb"),
    callocSize: document.getElementById("calloc-size"),
    freeBlock: document.getElementById("free-block"),
    reallocBlock: document.getElementById("realloc-block"),
    reallocSize: document.getElementById("realloc-size"),
  },
  resetButton: document.getElementById("reset-button"),
  demoButton: document.getElementById("demo-button"),
};

class HeapVisualizer {
  constructor(options = {}) {
    this.heapLimit = options.heapLimit ?? 2048; // bytes
    this.headerSize = options.headerSize ?? 16;
    this.alignment = options.alignment ?? 16;
    this.minSplittablePayload = options.minSplittablePayload ?? 32;
    this.blocks = [];
    this.nextAddress = 0;
    this.nextBlockId = 1;
    this.highlight = { searchTrail: [], best: null };
    this.highlightTimeout = null;
    this.logEntries = [];
    this.demoRunning = false;
    this.lastOperationId = 0;

    this.render();
    this.pushLog("info", "Heap visualization ready", "The heap starts empty. Use the controls above to allocate blocks.");
  }

  reset() {
    this.blocks = [];
    this.nextAddress = 0;
    this.nextBlockId = 1;
    this.highlight = { searchTrail: [], best: null };
    this.clearHighlightTimeout();
    this.render();
    this.logEntries = [];
    this.renderLog();
    this.pushLog("info", "Heap reset", "All blocks cleared and bump pointer returned to the start of the reserved region.");
  }

  align(size) {
    if (size <= 0) return 0;
    const remainder = size % this.alignment;
    return remainder === 0 ? size : size + (this.alignment - remainder);
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    const kib = bytes / 1024;
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`;
  }

  formatAddress(addr) {
    return `0x${addr.toString(16).padStart(4, "0")}`;
  }

  clearHighlightTimeout() {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }
  }

  setHighlight(searchTrail, best) {
    this.highlight = { searchTrail, best };
    this.clearHighlightTimeout();
    if (searchTrail.length || best !== null) {
      this.highlightTimeout = setTimeout(() => {
        this.highlight = { searchTrail: [], best: null };
        this.render();
      }, 2200);
    }
  }

  malloc(requestedSize, metadata = {}) {
    const size = Number(requestedSize);
    if (!Number.isFinite(size) || size <= 0) {
      this.pushLog("warn", "Cannot allocate invalid size", `Requested size must be a positive integer. Received: ${requestedSize}`);
      return null;
    }

    const alignedSize = this.align(size);
    const padding = alignedSize - size;

    const searchTrail = [];
    let bestIndex = -1;
    let bestBlock = null;

    for (let i = 0; i < this.blocks.length; i += 1) {
      const block = this.blocks[i];
      if (!block.allocated) {
        const fits = block.size >= alignedSize;
        searchTrail.push(block.id);
        if (fits && (!bestBlock || block.size < bestBlock.size)) {
          bestBlock = block;
          bestIndex = i;
        }
      }
    }

    let chosenBlock = null;
    let viaPointerBump = false;

    if (bestBlock) {
      chosenBlock = this.allocateFromFreeBlock(bestBlock, bestIndex, size, alignedSize, padding, metadata);
    } else {
      viaPointerBump = true;
      chosenBlock = this.allocateWithPointerBump(size, alignedSize, padding, metadata);
    }

    if (!chosenBlock) {
      this.setHighlight(searchTrail, null);
      return null;
    }

    this.setHighlight(searchTrail, chosenBlock.id);
    this.render();

    const operation = metadata.operation ?? (metadata.zeroed ? "calloc" : "malloc");
    const headline = viaPointerBump ? "Pointer bump allocation" : "Best-fit allocation";
    const reason = viaPointerBump
      ? `No free block satisfied ${this.formatBytes(size)}; expanded heap at bump pointer ${this.formatAddress(chosenBlock.offset)}.`
      : `Best-fit found block #${chosenBlock.id} (${this.formatBytes(chosenBlock.size)} payload).`;

    const details = [
      reason,
      `Requested: ${this.formatBytes(size)} (aligned to ${this.formatBytes(alignedSize)})`,
      viaPointerBump
        ? `Bump pointer advanced to ${this.formatAddress(this.nextAddress)}`
        : `Free block split: ${chosenBlock.splitting ? "yes" : "no"}`,
      padding > 0 ? `Padding for alignment: ${this.formatBytes(padding)}` : "No alignment padding required",
    ];

    this.pushLog(operation, headline, details.join(" • "));

    return chosenBlock;
  }

  allocateFromFreeBlock(block, index, requestedSize, alignedSize, padding, metadata) {
    const leftoverData = block.size - alignedSize - this.headerSize;
    let createdSplit = false;

    if (leftoverData >= this.minSplittablePayload) {
      createdSplit = true;
      const splitBlock = {
        id: this.nextBlockId++,
        offset: block.offset + this.headerSize + alignedSize,
        size: this.align(leftoverData),
        allocated: false,
        requested: 0,
        padding: 0,
        zeroed: false,
        source: "split",
        fromRealloc: false,
      };
      block.size = alignedSize;
      this.blocks.splice(index + 1, 0, splitBlock);
    }

    block.allocated = true;
    block.requested = requestedSize;
    block.padding = padding;
    block.zeroed = Boolean(metadata.zeroed);
    block.source = metadata.source ?? (metadata.zeroed ? "calloc" : "malloc");
    block.fromRealloc = Boolean(metadata.fromRealloc);
    block.splitting = createdSplit;

    return block;
  }

  allocateWithPointerBump(requestedSize, alignedSize, padding, metadata) {
    const totalSize = this.headerSize + alignedSize;
    if (this.nextAddress + totalSize > this.heapLimit) {
      this.pushLog(
        "warn",
        "Out of reserved heap space",
        `Cannot bump pointer by ${this.formatBytes(totalSize)} beyond heap limit ${this.formatBytes(this.heapLimit)}. Consider freeing a block.`
      );
      return null;
    }

    const block = {
      id: this.nextBlockId++,
      offset: this.nextAddress,
      size: alignedSize,
      allocated: true,
      requested: requestedSize,
      padding,
      zeroed: Boolean(metadata.zeroed),
      source: metadata.source ?? (metadata.zeroed ? "calloc" : "malloc"),
      fromRealloc: Boolean(metadata.fromRealloc),
      splitting: false,
    };

    this.blocks.push(block);
    this.nextAddress += totalSize;
    this.sortBlocks();
    return block;
  }

  calloc(nmemb, size) {
    const count = Number(nmemb);
    const bytes = Number(size);

    if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(bytes) || bytes <= 0) {
      this.pushLog("warn", "Invalid calloc parameters", `Elements and element size must be positive integers. Received: nmemb=${nmemb}, size=${size}`);
      return null;
    }

    const total = count * bytes;
    const block = this.malloc(total, { zeroed: true, operation: "calloc" });
    if (block) {
      this.pushLog(
        "calloc",
        "calloc zeroed payload",
        `Allocated ${count} elements × ${this.formatBytes(bytes)} = ${this.formatBytes(total)}`
      );
    }
    return block;
  }

  free(blockId, metadata = {}) {
    const id = Number(blockId);
    const block = this.blocks.find((b) => b.id === id);

    if (!block) {
      this.pushLog("warn", "Cannot free unknown block", `Block id ${blockId} does not exist.`);
      return;
    }
    if (!block.allocated) {
      this.pushLog("warn", "Double free detected", `Block #${block.id} is already on the free list.`);
      return;
    }

    block.allocated = false;
    block.zeroed = false;
    block.source = metadata.source ?? "free";
    block.fromRealloc = false;
    block.padding = 0;
    block.requested = 0;
    block.splitting = false;

    this.coalesce();
    this.render();
    this.pushLog("free", `Freed block #${block.id}`, `Returned ${this.formatBytes(block.size)} to the free list. Adjacent free blocks coalesced automatically.`);
  }

  realloc(blockId, newSize) {
    const id = Number(blockId);
    const size = Number(newSize);
    const block = this.blocks.find((b) => b.id === id);

    if (!block) {
      this.pushLog("warn", "Cannot realloc unknown block", `Block id ${blockId} does not exist.`);
      return null;
    }

    if (!Number.isFinite(size) || size < 0) {
      this.pushLog("warn", "Invalid realloc size", `Requested size must be zero or positive. Received: ${newSize}`);
      return null;
    }

    if (size === 0) {
      this.pushLog("realloc", `realloc(#${blockId}, 0)`, "Equivalent to free. Block released.");
      this.free(blockId, { source: "realloc" });
      return null;
    }

    const aligned = this.align(size);

    if (aligned <= block.size) {
      const leftover = block.size - aligned - this.headerSize;
      block.size = aligned;
      block.requested = size;
      block.padding = aligned - size;
      block.source = "realloc";
      block.fromRealloc = true;

      if (leftover >= this.minSplittablePayload) {
        const newBlock = {
          id: this.nextBlockId++,
          offset: block.offset + this.headerSize + aligned,
          size: this.align(leftover),
          allocated: false,
          requested: 0,
          padding: 0,
          zeroed: false,
          source: "split",
          fromRealloc: false,
          splitting: false,
        };
        this.blocks.splice(this.blocks.indexOf(block) + 1, 0, newBlock);
        this.coalesce();
      }

      this.render();
      this.pushLog(
        "realloc",
        `Shrank block #${block.id}`,
        `New payload ${this.formatBytes(size)} (aligned ${this.formatBytes(aligned)}). Excess returned to the free list.`
      );
      return block;
    }

    const newBlock = this.malloc(size, { fromRealloc: true, source: "realloc", operation: "realloc" });

    if (!newBlock) {
      this.pushLog("realloc", `Failed to grow block #${block.id}`, `Unable to allocate ${this.formatBytes(size)} for reallocation.`);
      return null;
    }

    this.pushLog(
      "realloc",
      `Moved block #${block.id} -> #${newBlock.id}`,
      `Allocated ${this.formatBytes(size)} and freed original block, simulating memcpy of ${this.formatBytes(block.size)} bytes.`
    );

    this.free(block.id, { source: "realloc" });
    return newBlock;
  }

  coalesce() {
    this.sortBlocks();
    for (let i = 0; i < this.blocks.length - 1; i += 1) {
      const current = this.blocks[i];
      const next = this.blocks[i + 1];
      if (!current.allocated && !next.allocated) {
        current.size += this.headerSize + next.size;
        this.blocks.splice(i + 1, 1);
        i -= 1;
      }
    }
  }

  sortBlocks() {
    this.blocks.sort((a, b) => a.offset - b.offset);
  }

  render() {
    this.sortBlocks();
    this.renderHeap();
    this.renderDetails();
    this.updateSelectOptions();
    this.updateBumpPointer();
  }

  renderHeap() {
    dom.heapView.innerHTML = "";
    const blocks = [...this.blocks];
    const searchSet = new Set(this.highlight.searchTrail);

    blocks.forEach((block) => {
      const totalSize = this.headerSize + block.size;
      const element = document.createElement("div");
      element.classList.add("heap-block");
      element.classList.add(block.allocated ? "heap-block--allocated" : "heap-block--free");

      if (block.zeroed) element.classList.add("heap-block--zeroed");
      if (block.fromRealloc) element.classList.add("heap-block--from-realloc");
      if (searchSet.has(block.id)) element.classList.add("heap-block--highlight-search");
      if (this.highlight.best === block.id) element.classList.add("heap-block--highlight-best");

      element.style.flexGrow = totalSize;

      const header = document.createElement("div");
      header.className = "heap-block__header";
      header.textContent = `hdr ${this.headerSize}B`;

      const payload = document.createElement("div");
      payload.className = "heap-block__payload";
      payload.innerHTML = `
        <div class="heap-block__label">#${block.id}</div>
        <div>${block.allocated ? "allocated" : "free"}</div>
        <div>${this.formatBytes(block.size)}</div>
      `;

      const meta = document.createElement("div");
      meta.className = "heap-block__meta";
      meta.innerHTML = `
        <span>${this.formatAddress(block.offset)}</span>
        <span>${block.allocated ? block.source : "free list"}</span>
      `;

      payload.appendChild(meta);
      element.appendChild(header);
      element.appendChild(payload);

      if (block.allocated && block.padding > 0) {
        const paddingEl = document.createElement("div");
        paddingEl.className = "heap-block__padding";
        paddingEl.textContent = `padding ${this.formatBytes(block.padding)}`;
        element.appendChild(paddingEl);
      }

      dom.heapView.appendChild(element);
    });

    const unused = this.heapLimit - this.nextAddress;
    if (unused > 0) {
      const remainder = document.createElement("div");
      remainder.classList.add("heap-block", "heap-block--unused");
      remainder.style.flexGrow = unused;
      const header = document.createElement("div");
      header.className = "heap-block__header";
      header.textContent = "unused";
      const payload = document.createElement("div");
      payload.className = "heap-block__payload";
      payload.innerHTML = `
        <div class="heap-block__label">reserved</div>
        <div>${this.formatBytes(unused)} remaining</div>
      `;
      remainder.append(header, payload);
      dom.heapView.appendChild(remainder);
    }
  }

  renderDetails() {
    dom.freeList.innerHTML = "";
    dom.allocatedList.innerHTML = "";

    this.blocks.forEach((block) => {
      const item = document.createElement("li");
      if (block.allocated) {
        item.innerHTML = `<strong>#${block.id}</strong> • ${this.formatBytes(block.requested)} requested (${this.formatBytes(block.size)} aligned) • ${block.source}`;
        dom.allocatedList.appendChild(item);
      } else {
        item.textContent = `#${block.id} • ${this.formatBytes(block.size)} payload at ${this.formatAddress(block.offset)}`;
        dom.freeList.appendChild(item);
      }
    });

    if (!dom.freeList.children.length) {
      const empty = document.createElement("li");
      empty.textContent = "No free blocks yet.";
      dom.freeList.appendChild(empty);
    }

    if (!dom.allocatedList.children.length) {
      const empty = document.createElement("li");
      empty.textContent = "No active allocations.";
      dom.allocatedList.appendChild(empty);
    }
  }

  updateSelectOptions() {
    const allocatedBlocks = this.blocks.filter((block) => block.allocated);
    const selects = [dom.inputs.freeBlock, dom.inputs.reallocBlock];
    selects.forEach((select) => {
      const previousValue = select.value;
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = allocatedBlocks.length ? "Select block…" : "No blocks";
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);

      allocatedBlocks.forEach((block) => {
        const option = document.createElement("option");
        option.value = block.id;
        option.textContent = `#${block.id} • ${this.formatBytes(block.size)}`;
        select.appendChild(option);
      });

      if (allocatedBlocks.some((block) => String(block.id) === previousValue)) {
        select.value = previousValue;
      }

      select.disabled = allocatedBlocks.length === 0;
    });
  }

  updateBumpPointer() {
    const ratio = Math.min(1, this.nextAddress / this.heapLimit);
    dom.bumpPointer.style.left = `calc(${ratio * 100}% - 10px)`;
    dom.bumpPointer.setAttribute("title", `Bump pointer at ${this.formatAddress(this.nextAddress)} (remaining ${this.formatBytes(this.heapLimit - this.nextAddress)})`);
  }

  pushLog(type, headline, message) {
    const entry = {
      id: ++this.lastOperationId,
      type,
      headline,
      message,
      timestamp: new Date(),
    };
    this.logEntries.unshift(entry);
    if (this.logEntries.length > 80) {
      this.logEntries.pop();
    }
    this.renderLog();
  }

  renderLog() {
    dom.logEntries.innerHTML = "";
    this.logEntries.forEach((entry) => {
      const el = document.createElement("article");
      el.classList.add("log-entry", `log-entry--${entry.type}`);

      const badge = document.createElement("span");
      badge.className = "log-entry__badge";
      badge.textContent = entry.type.toUpperCase();

      const headline = document.createElement("p");
      headline.className = "log-entry__message";
      headline.textContent = entry.headline;

      const subtext = document.createElement("p");
      subtext.className = "log-entry__subtext";
      subtext.textContent = entry.message;

      el.append(badge, headline, subtext);
      dom.logEntries.appendChild(el);
    });
  }

  async runDemoSequence() {
    if (this.demoRunning) {
      this.pushLog("info", "Demo already running", "Please wait for the current guided demonstration to finish.");
      return;
    }

    this.demoRunning = true;
    this.reset();
    this.pushLog("info", "Guided demo", "Running a scripted sequence that exercises malloc, calloc, free, pointer bumping, and realloc.");

    const refs = {};
    const sequence = [
      { action: "malloc", size: 96, alias: "alpha" },
      { action: "malloc", size: 160, alias: "beta" },
      { action: "malloc", size: 48, alias: "gamma" },
      { action: "free", target: "beta" },
      { action: "calloc", nmemb: 4, size: 32, alias: "delta" },
      { action: "malloc", size: 96, alias: "epsilon" },
      { action: "realloc", target: "gamma", size: 160, alias: "gamma" },
      { action: "malloc", size: 256, alias: "zeta" },
      { action: "free", target: "alpha" },
      { action: "malloc", size: 64, alias: "eta" },
      { action: "realloc", target: "delta", size: 64, alias: "delta" },
    ];

    for (const step of sequence) {
      if (!this.demoRunning) break;

      switch (step.action) {
        case "malloc": {
          const block = this.malloc(step.size, { source: "demo" });
          if (block && step.alias) refs[step.alias] = block.id;
          break;
        }
        case "calloc": {
          const block = this.calloc(step.nmemb, step.size);
          if (block && step.alias) refs[step.alias] = block.id;
          break;
        }
        case "free": {
          const id = typeof step.target === "string" ? refs[step.target] : step.target;
          if (id) this.free(id, { source: "demo" });
          else this.pushLog("warn", "Demo step skipped", `Could not free unknown reference ${step.target}`);
          break;
        }
        case "realloc": {
          const id = typeof step.target === "string" ? refs[step.target] : step.target;
          if (id) {
            const block = this.realloc(id, step.size);
            if (block && step.alias) refs[step.alias] = block.id;
          } else {
            this.pushLog("warn", "Demo step skipped", `Could not realloc unknown reference ${step.target}`);
          }
          break;
        }
        default:
          break;
      }

      await this.delay(step.delay ?? 1200);
    }

    this.demoRunning = false;
    this.pushLog("info", "Demo complete", "Experiment with the heap using the manual controls to explore further.");
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const visualizer = new HeapVisualizer();

dom.forms.malloc.addEventListener("submit", (event) => {
  event.preventDefault();
  const size = dom.inputs.mallocSize.value;
  visualizer.malloc(size);
  dom.inputs.mallocSize.focus();
});

dom.forms.calloc.addEventListener("submit", (event) => {
  event.preventDefault();
  const nmemb = dom.inputs.callocNmemb.value;
  const size = dom.inputs.callocSize.value;
  visualizer.calloc(nmemb, size);
  dom.inputs.callocNmemb.focus();
});

dom.forms.free.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = dom.inputs.freeBlock.value;
  if (id) visualizer.free(id);
});

dom.forms.realloc.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = dom.inputs.reallocBlock.value;
  const size = dom.inputs.reallocSize.value;
  if (id) visualizer.realloc(id, size);
});

dom.resetButton.addEventListener("click", () => visualizer.reset());
dom.demoButton.addEventListener("click", () => visualizer.runDemoSequence());
