#include <stdlib.h>
#include <stdio.h>

int main (int argc, char **argv){

  char* ptr1 = malloc(100);
  char* ptr2 = malloc(200);
  char* ptr3 = malloc(300);
  
  printf("P1 = %p\n", ptr1);
  printf("P2 = %p\n", ptr2);
  printf("P3 = %p\n", ptr3);
  
  char* a = realloc(ptr1, 30); //no change; should return ptr1
  char* b = realloc(ptr2, 200);// no change; should return ptr1
  char* c = realloc(ptr3, 330);// should return a new pointer to a bigger block
  char* d = realloc(NULL, 99); //should return a new block
  
  printf("a should be P1 %p\n", a);
  printf("b should be P2 %p\n", b);
  printf("c should not be P3 %p\n", c);
  printf("d should be a new or freed address %p\n", d);
  
  char* e = realloc(ptr1, 0); // should delete block refered to by ptr1
  printf("P1 = %p\n", ptr1);
  
  
  
  /* All these addresses have to be multiples of 16. An easy way to check
   is to see whether they end with 0. If that's the case, then they are divisible.*/
  char* firstSpace = (char*)malloc (30);
   
   char array[] = "Hello, again. I am back";

   for (int i = 0; i < 23 ; ++i){
     firstSpace[i] = array [i];
   }
   char* smallCopy = (char*)realloc(firstSpace, 10); 
   char* bigCopy = (char*)realloc(firstSpace, 60);
   printf("Address of first string = %p\n", firstSpace);
   printf("String: = %s\n", firstSpace);
   // let'try boxes of a small and bigger size to see if the realloc() and memcpy() work
   printf("[+] Testing realloc() on a string\n");
   printf("Address of Small Copy  = %p\n", smallCopy);
   printf("Small Copy: = %s\n", smallCopy);
   printf("Address of Big Copy = %p\n", bigCopy);
   printf("Big Copy: = %s\n", bigCopy);

   printf("[+] Testing Free().  Freeing small copy...\n");
   free(smallCopy);

}
