// ============================================================================77;30503;0c==
/**
 * bf-alloc.c
 *
 * A _best-fit_ heap allocator.  This allocator uses a _doubly-linked free list_
 * from which to allocate the best fitting free block.  If the list does not
 * contain any blocks of sufficient size, it uses _pointer bumping_ to expand
 * the heap.
 **/
// ==============================================================================



// ==============================================================================
// INCLUDES

#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>

#include "safeio.h"
// ==============================================================================



// ==============================================================================
// TYPES AND STRUCTURES

/** The header for each allocated object. */
typedef struct header {

  /** Pointer to the next header in the list. */
  struct header* next;

  /** Pointer to the previous header in the list. */
  struct header* prev;

  /** The usable size of the block (exclusive of the header itself). */
  size_t         size;

  /** Is the block allocated or free? */
  bool           allocated;

} header_s;
// ==============================================================================



// ==============================================================================
// MACRO CONSTANTS AND FUNCTIONS

/** The system's page size. */
#define PAGE_SIZE sysconf(_SC_PAGESIZE)

/**
 * Macros to easily calculate the number of bytes for larger scales (e.g., kilo,
 * mega, gigabytes).
 */
#define KB(size)  ((size_t)size * 1024)
#define MB(size)  (KB(size) * 1024)
#define GB(size)  (MB(size) * 1024)

/** The virtual address space reserved for the heap. */
#define HEAP_SIZE GB(2)

size_t roundUp(size_t size);
size_t padding (size_t s); 

/** Given a pointer to a header, obtain a `void*` pointer to the block itself. */
#define HEADER_TO_BLOCK(hp) (void*)((intptr_t)hp + sizeof(header_s))

/** Given a pointer to a block, obtain a `header_s*` pointer to its header. */
#define BLOCK_TO_HEADER(bp) (header_s*)((intptr_t)bp - sizeof(header_s))

// ==============================================================================


// ==============================================================================
// GLOBALS

/** The address of the next available byte in the heap region. */
static intptr_t free_addr  = 0;

/** The beginning of the heap. */
static intptr_t start_addr = 0;

/** The end of the heap. */
static intptr_t end_addr   = 0;

/** The head of the free list. */
static header_s* free_list_head = NULL;

/** The head of the allocated list */
static header_s* allocated_list_head = NULL;
// ==============================================================================

size_t padding (size_t s) {
  if (s % 16 == 0)return 0;
  else return 16 - (s % 16);
}

// ==============================================================================
/**
 * The initialization method.  If this is the first use of the heap, initialize it.
 */

void init () {

  // Only do anything if there is no heap region (i.e., first time called).
  if (start_addr == 0) {

    DEBUG("Trying to initialize");
    
    // Allocate virtual address space in which the heap will reside. Make it
    // un-shared and not backed by any file (_anonymous_ space).  A failure to
    // map this space is fatal.
    void* heap = mmap(NULL,
		      HEAP_SIZE,
		      PROT_READ | PROT_WRITE,
		      MAP_PRIVATE | MAP_ANONYMOUS,
		      -1,
		      0);
    if (heap == MAP_FAILED) {
      ERROR("Could not mmap() heap region");
    }

    // Hold onto the boundaries of the heap as a whole.
    start_addr = (intptr_t)heap;
    end_addr   = start_addr + HEAP_SIZE;
    free_addr  = start_addr;

    // DEBUG: Emit a message to indicate that this allocator is being called.
    DEBUG("bf-alloc initialized");

  }

} // init ()
// ==============================================================================

// A method to d-word align the blocks. It rounds up any size to the nearest multiple of 16
size_t roundUp(size_t size){
  size_t newSize = size + 16;
  size_t mod = newSize % 16;
  newSize = newSize - mod;
  return newSize;
}

// ==============================================================================
/**
 * Allocate and return `size` bytes of heap space.  Specifically, search the
 * free list, choosing the _best fit_.  If no such block is available, expand
 * into the heap region via _pointer bumping_.
 *
 * \param size The number of bytes to allocate.
 * \return A pointer to the allocated block, if successful; `NULL` if unsuccessful.
 */
void* malloc (size_t size) {

  init();

  if (size == 0) {
    return NULL;
  }
  //   size = roundUp(size);

  header_s* current = free_list_head;
  header_s* best    = NULL;
  while (current != NULL) { // while we have not reached the end of the 'free' list

    if (current->allocated) {
      ERROR("Allocated block on free list", (intptr_t)current); // throw an error if we find an allocated block on the free list
    }
    
    if ( (best == NULL && size <= current->size) ||
	 (best != NULL && size <= current->size && current->size < best->size) ) { // a best block is defined as one with the size greater than but closest to the requested size
      best = current;
    }

    if (best != NULL && best->size == size) {// if we find a perfect fit, there is no need to keep moving through the list.
      break;
    }

    current = current->next;
    
  }
  // now once we have a free block that can be our best fit or we couldn't find one

  void* new_block_ptr = NULL;
  if (best != NULL) { // if we know the block we want, we'll remove it from the list

    if (best->prev == NULL) { // pointer reallocation to remove the best block from the 'free' list. classic dll remove()
      free_list_head   = best->next;
    } else {
      best->prev->next = best->next;
    }
    if (best->next != NULL) {
      best->next->prev = best->prev;
    }
    best->prev       = NULL;
    best->next       = NULL;

    best->allocated = true;// set its allocated flag to true
    best->next = allocated_list_head;  //insert it at the front of the list of allocated blocks
    allocated_list_head = best; // make it the new head of allocated blocks
    new_block_ptr   = HEADER_TO_BLOCK(best); //get the pointer to the usable block space. NOTE: I have modified this function to take into account the paddind for alignment.
    
  } else {

    header_s* header_ptr = (header_s*)free_addr;
    new_block_ptr = HEADER_TO_BLOCK(header_ptr);

    size = size + padding(size);

    //    size_t head_padd = padding(sizeof(header_s*));

    /*Initial values for a new block*/
    header_ptr->next      = NULL;
    header_ptr->prev      = NULL;
    header_ptr->size      = size;
    header_ptr->allocated = true;

    /*Add it to the front of the list of allocated blocks*/
    header_ptr->next = allocated_list_head;
    allocated_list_head = header_ptr;

     if (header_ptr-> next != NULL){
    header_ptr-> next ->prev = header_ptr;}// OF COURSE!! it's a doubly linked list!!
    
     intptr_t new_free_addr = (intptr_t)new_block_ptr + padding(sizeof(header_s)) + size;
    if (new_free_addr > end_addr) {

      return NULL;

    } else {

      free_addr = new_free_addr;

    }

  }
  // Edits accoriding to Prof's comment
  // Still got some questions for this (coz we've already updated the head)...
  header_s* new_head = BLOCK_TO_HEADER(new_block_ptr);
  if (allocated_list_head == NULL) allocated_list_head = new_head;
  else new_head -> next = allocated_list_head;
  

  return new_block_ptr;

} // malloc()
// ==============================================================================



// ==============================================================================
/**
 * Deallocate a given block on the heap.  Add the given block (if any) to the
 * free list.
 *
 * \param ptr A pointer to the block to be deallocated.
 */
void free (void* ptr) {
  printf("free()...\n");

  if (ptr == NULL) {
    return;
  }

  header_s* header_ptr = BLOCK_TO_HEADER(ptr);

  if (!header_ptr->allocated) {
    ERROR("Double-free: ", (intptr_t)header_ptr);
  }
  
  // Removing the target block from the list of allocated blocks
  if (header_ptr->prev == NULL){
    allocated_list_head = header_ptr->next;
  }
  else {
    header_ptr->prev->next = header_ptr->next;
  }
  if (header_ptr->next!= NULL){
    header_ptr->next->prev = header_ptr->prev;
  }
  
  header_ptr->next = NULL;
  header_ptr->prev = NULL;
  // removal complete

  header_ptr->next = free_list_head; // add the freed block to the front of the list of free blocks
  free_list_head   = header_ptr;

  if (header_ptr-> next != NULL){
    header_ptr-> next ->prev = header_ptr;}// OF COURSE!! it's a doubly linked list!!
  
  header_ptr->allocated = false; // THE DEALLOCATION IS COMPLETE
  printf("Is Allocated?: %d \n", header_ptr->allocated);
} // free()
// ==============================================================================



// ==============================================================================
/**
 * Allocate a block of `nmemb * size` bytes on the heap, zeroing its contents.
 *
 * \param nmemb The number of elements in the new block.
 * \param size  The size, in bytes, of each of the `nmemb` elements.
 * \return      A pointer to the newly allocated and zeroed block, if successful;
 *              `NULL` if unsuccessful.
 */
void* calloc (size_t nmemb, size_t size) {

  // Allocate a block of the requested size.
  size_t block_size    = nmemb * size;
  void*  new_block_ptr = malloc(block_size);

  // If the allocation succeeded, clear the entire block.
  if (new_block_ptr != NULL) {
    memset(new_block_ptr, 0, block_size);
  }

  return new_block_ptr;
  
} // calloc ()
// ==============================================================================



// ==============================================================================
/**
 * Update the given block at `ptr` to take on the given `size`.  Here, if `size`
 * fits within the given block, then the block is returned unchanged.  If the
 * `size` is an increase for the block, then a new and larger block is
 * allocated, and the data from the old block is copied, the old block freed,
 * and the new block returned.
 *
 * \param ptr  The block to be assigned a new size.
 * \param size The new size that the block should assume.
 * \return     A pointer to the resultant block, which may be `ptr` itself, or
 *             may be a newly allocated block.
 */
void* realloc (void* ptr, size_t size) {

  // Special case: If there is no original block, then just allocate the new one
  // of the given size.
  if (ptr == NULL) {
    return malloc(size);
  }

  // Special case: If the new size is 0, that's tantamount to freeing the block.
  if (size == 0) {
    free(ptr);
    return NULL;
  }

  // Get the current block size from its header.
  header_s* header_ptr = BLOCK_TO_HEADER(ptr);

  // If the new size isn't an increase, then just return the original block as-is.
  if (size <= header_ptr->size) {
    return ptr;
  }

  // The new size is an increase.  Allocate the new, larger block, copy the
  // contents of the old into it, and free the old.
  void* new_block_ptr = malloc(size);
  if (new_block_ptr != NULL) {
    memcpy(new_block_ptr, ptr, header_ptr->size);
    free(ptr);
  }
    
  return new_block_ptr;
  
} // realloc()
// ==============================================================================
