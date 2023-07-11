import {CALL, Instructions} from "./classes/Instruction";
import Cpu from "./classes/Cpu";
import {Sizes} from "./classes/Registers";

let cpu = new Cpu();
cpu.AX.Value = 0x1230;
cpu.DS.Value = 1;
cpu.SS.Value = 2;
cpu.IF.Value = true;

cpu.setMEM(0, 1,[0x01, 0x02, 0x03, 0x04])
cpu.setMEM(5, 1,[0x1A, 0x12])
let i = 0;
let bins = [0xFF, 0b00011000, 0x00, 0x00, 0x00, 0x00]
let ins = Instructions.find(x => x.check(bins,0 ));
console.log(ins.asASM(bins, 0).asm);
if(ins) {
    ins?.run(cpu, bins);
}
    // if (ins) {
    //     console.log(ins.asASM(bins, 1).asm, ins.asASM(bins, 1).bytes.map(x => x.toString(16).padStart(2, '0')));
    // }
