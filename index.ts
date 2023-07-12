import {ADC, ADD, AND, CALL, Instructions} from "./classes/Instruction";
import Cpu from "./classes/Cpu";
import {Sizes} from "./classes/Registers";

let cpu = new Cpu();
cpu.AX.Value = 0x1230;
cpu.DS.Value = 1;
cpu.SS.Value = 2;
cpu.IF.Value = true;

cpu.setMEM(0, 1,[0x01, 0x02, 0x03, 0x04])
cpu.setMEM(5, 1,[0x1A, 0x12])

function findInst(bits){
    let asm = Instructions.find(x => x.check(bits))?.asASM(bits);
    console.log(asm.bytes?.map(x => x.toString(16).padStart(2, '0')).join('')+'\t'+asm.asm+'\t'+asm.size);
}

let bits = [0b00110111];
console.log("===AAA===");
findInst([0b00110111])
console.log("===AAD===");
findInst([0b11010101, 0b00001010]);
console.log("===AAM===");
findInst([0b11010100, 0b00001010]);
console.log("===AAS===");
findInst([0b00111111]);
function rdsInstruction(b1, b2, b3) {
    for (let d = 0; d <= 1; d++)
        for (let w = 0; w <= 1; w++)
            for (let mod = 0; mod <= 0b11; mod++)
                for (let reg = 0; reg <= 0b111; reg++)
                    for (let rm = 0; rm <= 0b111; rm++)
                        findInst([parseInt(b1 + d.toString(2) + w.toString(2), 2),
                            parseInt('' + mod.toString(2).padStart(2, '0') + reg.toString(2).padStart(3, '0') + rm.toString(2).padStart(3, '0'), 2),
                            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
                        ]);
    for (let s = 0; s <= 1; s++)
        for (let w = 0; w <= 1; w++)
            for (let mod = 0; mod <= 0b11; mod++)
                for (let rm = 0; rm <= 0b111; rm++)
                    findInst([parseInt(b2[0] + s.toString(2) + w.toString(2), 2),
                        parseInt('' + mod.toString(2).padStart(2, '0') + b2[1] + rm.toString(2).padStart(3, '0'), 2),
                        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
                    ]);
    for (let w = 0; w <= 1; w++)
        findInst([parseInt(b3 + w.toString(2), 2), 0x01, 0x02]);
}
console.log("===ADC===");
rdsInstruction('000100', ['100000', '010'], '0001010') //80d001
console.log("===ADD===");
rdsInstruction('000000', ['100000', '000'], '0000010') //TODO fix b2
console.log("===AND===");
rdsInstruction('001000', ['100000', '100'], '0010010') //TODO fix b2
