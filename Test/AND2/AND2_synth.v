module AND2
  (input  a,
   input  b,
   output y);
  wire n1_o;
  assign y = n1_o; //(module output)
  /* Test/AND2.vhd:14:12  */
  assign n1_o = a & b;
endmodule
