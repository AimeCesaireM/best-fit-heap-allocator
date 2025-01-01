# Best-Fit Heap Allocator

A custom memory allocator that implements a **best-fit** allocation strategy for heap management. It utilizes a **doubly linked free list** to track available memory blocks and allocates memory based on the block that best fits the requested size. If no suitable block is found, the allocator will expand the heap using **pointer bumping**.

## Features

- **Best-Fit Allocation**: Finds the best fitting block of memory from a free list.
- **Doubly Linked Free List**: Tracks free memory blocks and supports efficient memory management.
- **Pointer Bumping**: Expands the heap when no fitting block is available.
- **Block Alignment**: Ensures that all allocated blocks are aligned to 16-byte boundaries for better performance.
- **Custom `malloc`, `free`, `calloc`, `realloc` Implementation**: Implements standard memory management functions with a custom heap allocator.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## Installation

To use this allocator in your project, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/best-fit-allocator.git
   ```

2. Navigate to the project directory:

   ```bash
   cd best-fit-allocator
   ```

3. Compile the project (if applicable):

   ```bash
   gcc -o bf-alloc bf-alloc.c
   ```

4. Include `bf-alloc.c` in your project and use the custom `malloc`, `free`, `calloc`, and `realloc` functions.

## Usage

To use this custom allocator, simply replace the standard memory allocation functions with the custom versions provided in `bf-alloc.c`. For example:

```c
#include "bf-alloc.c"

int main() {
    // Initialize the allocator
    init();

    // Use malloc to allocate memory
    void* ptr = malloc(100);
    
    // Use calloc to allocate zero-initialized memory
    void* ptr2 = calloc(10, sizeof(int));

    // Use realloc to resize a memory block
    ptr = realloc(ptr, 200);

    // Use free to deallocate memory
    free(ptr);
    free(ptr2);

    return 0;
}
```

## API Reference

### `void init()`
Initializes the heap and memory allocator if it hasn’t been initialized yet.

### `void* malloc(size_t size)`
Allocates a block of memory of at least `size` bytes from the heap using a best-fit allocation strategy. If no suitable block is found, the heap will be expanded using pointer bumping.

- **Parameters**: `size` - The number of bytes to allocate.
- **Returns**: A pointer to the allocated memory block, or `NULL` if allocation fails.

### `void free(void* ptr)`
Deallocates the memory block pointed to by `ptr` and returns it to the free list.

- **Parameters**: `ptr` - A pointer to the block of memory to free.

### `void* calloc(size_t nmemb, size_t size)`
Allocates a block of memory large enough to hold `nmemb` elements, each of `size` bytes, and initializes the memory to zero.

- **Parameters**: `nmemb` - The number of elements to allocate.  
  `size` - The size of each element in bytes.
- **Returns**: A pointer to the zeroed block of memory, or `NULL` if allocation fails.

### `void* realloc(void* ptr, size_t size)`
Resizes the memory block pointed to by `ptr` to a new size. If the block is increased in size, the new memory is initialized to zero.

- **Parameters**: `ptr` - A pointer to the block of memory to resize.  
  `size` - The new size of the block.
- **Returns**: A pointer to the resized memory block, or `NULL` if resizing fails.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Commit your changes (`git commit -am 'Add new feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Create a new pull request.

Please ensure that your code follows the existing coding style and includes proper documentation.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

