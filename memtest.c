#include <stdlib.h>
#include <stdio.h>

int main (int argc, char **argv){

  char* alloc1 = malloc(100);
  char* alloc2 = malloc(200);
  char* alloc3 = malloc(99);
  
  printf("alloc1 = %p\n", alloc1);
  printf("alloc2 = %p\n", alloc2);
  printf("alloc3 = %p\n", alloc3);

  char* realloc1 = realloc(alloc1, 140); //should be different address
  char* realloc2 = realloc(alloc2, 30);  //should be same address, different block size
  char* realloc3 = realloc(alloc3, 99);  //should be same address, same block size
  printf("realloc1 = %p\n", realloc1);
  printf("realloc2 = %p\n", realloc2);
  printf("realloc3 = %p\n", realloc3);
  
}
