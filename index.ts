import {CALL, Instructions} from "./classes/Instruction";
import Cpu from "./classes/Cpu";
import {Sizes} from "./classes/Registers";

let cpu = new Cpu();
cpu.AX.Value = 0x1230;
cpu.DS.Value = 1;
cpu.SS.Value = 2;
cpu.IF.Value = true;

cpu.setMEM(0, 1,[0x32, 0x20])
cpu.setMEM(5, 1,[0x1A, 0x12])
let i = 0;

for(; i < 0b1000; i++){
    let j = 0;
    for(; j < 0b100;j++) {
        let bins = [0x00, 0x9A, (j << 6)| 0b011000 | i, 0x00, 0x00];

        let ins = CALL[2];
        let asm = ins.asASM(bins, 1);
        if(ins) console.log(asm.asm, asm.bytes.map(x => x.toString(16).padStart(2, '0')))
    }
}

    // if (ins) {
    //     console.log(ins.asASM(bins, 1).asm, ins.asASM(bins, 1).bytes.map(x => x.toString(16).padStart(2, '0')));
    // }
