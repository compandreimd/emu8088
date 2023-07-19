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

function findInst(bits, c = cpu){
    let inst = Instructions.find(x => x.check(bits));
    let asm = inst?.asASM(bits);
    console.log(asm.bytes?.map(x => x.toString(16).padStart(2, '0')).join('')+'\t'+asm.asm+'\t'+asm.size, asm.bytes);
    return inst.run.bind(inst, c, bits);
}
function f1(b1,b2){
    for (let w = 0; w <= 1; w++)
        for (let mod = 0; mod <= 0b11; mod++)
            for (let reg = 0; reg <= 0b111; reg++)
                for (let rm = 0; rm <= 0b111; rm++)
                    findInst([parseInt(b1 + w.toString(2), 2),
                        parseInt('' + mod.toString(2).padStart(2, '0') + b2 + rm.toString(2).padStart(3, '0'), 2),
                        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
                    ]);
}
function f() {
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
    rdsInstruction('000100', ['100000', '010'], '0001010')
    console.log("===ADD===");
    rdsInstruction('000000', ['100000', '000'], '0000010')
    console.log("===AND===");
    rdsInstruction('001000', ['100000', '100'], '0010010')
    console.log("===CALL===");
    findInst([0b11101000, 1, 2])
    let b2 = ['11111111', '010']
    for (let mod = 0; mod <= 0b11; mod++)
        for (let rm = 0; rm <= 0b111; rm++)
            findInst([parseInt(b2[0], 2),
                parseInt('' + mod.toString(2).padStart(2, '0') + b2[1] + rm.toString(2).padStart(3, '0'), 2),
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
            ]);
    findInst([0b10011010, 1, 2, 3, 4])
    b2 = ['11111111', '011']
    for (let mod = 0; mod <= 0b11; mod++)
        for (let rm = 0; rm <= 0b111; rm++)
            findInst([parseInt(b2[0], 2),
                parseInt('' + mod.toString(2).padStart(2, '0') + b2[1] + rm.toString(2).padStart(3, '0'), 2),
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
            ]);
    console.log("===CBW===");
    findInst([0b10011000]);
    console.log("===CLC===");
    findInst([0b11111000]);
    console.log("===CLD===");
    findInst([0b11111100]);
    console.log("===CLI===");
    findInst([0b11111010]);
    console.log("===CMC===");
    findInst([0b11110101]);
    console.log("===CMP===");
    rdsInstruction('001110', ['100000', '111'], '0011110')
    console.log("===CMPS==");
    findInst([0b10100110]);
    findInst([0b10100111]);
    console.log("===DAA==");
    findInst([0b00100111]);
    console.log("===DAS==");
    findInst([0b00101111]);
    console.log("===DEC===")
    f1('1111111', '001')
    for (let reg = 0; reg <= 0b111; reg++)
        findInst([parseInt('01001' + reg.toString(2).padStart(3, '0'), 2),
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
        ]);
    console.log("===DIV===")
    for (let w = 0; w <= 1; w++)
        for (let mod = 0; mod <= 0b11; mod++)
            for (let reg = 0; reg <= 0b111; reg++)
                for (let rm = 0; rm <= 0b111; rm++)
                    findInst([parseInt('1111011' + w.toString(2), 2),
                        parseInt('' + mod.toString(2).padStart(2, '0') + '110' + rm.toString(2).padStart(3, '0'), 2),
                        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
                    ]);
    console.log("===ESC===")
    for (let x = 0; x <= 0b111; x++)
        for (let mod = 0; mod <= 0b11; mod++)
            for (let reg = 0; reg <= 0b111; reg++)
                for (let rm = 0; rm <= 0b111; rm++)
                    findInst([parseInt('11011' + x.toString(2).padStart(3, '0'), 2),
                        parseInt('' + mod.toString(2).padStart(2, '0') + x.toString(2).padStart(3, '0') + rm.toString(2).padStart(3, '0'), 2),
                        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
                    ]);
    console.log("===HLT===")
    findInst([0b11110100])
    console.log("===IDIV===")
    f1('1111011', '111')
    console.log("===IMUL===")
    f1('1111011', '101')
    console.log("===IN===")
    findInst([0b11100100, 0x01])
    findInst([0b11100101, 0x02])
    findInst([0b11101100])
    findInst([0b11101101])
    console.log("===INC===")
    f1('1111111', '000')
    for (let reg = 0; reg <= 0b111; reg++)
        findInst([parseInt('01001' + reg.toString(2).padStart(3, '0'), 2),
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
        ]);

}
cpu.AX.Value = 12202;
cpu.BX.Value = 2;
cpu.CX.Value = 24021;
cpu.DX.Value = 0;
findInst([0b01110010, 0xFE, 0x20]);
findInst( [0b01110111, 0x2, 0x20]);
findInst([0b01110111, 0x4,0x20]);
findInst([0b01110011, 0x6,0x20]);
findInst([0b01110011, 0x8,0x20]);
findInst([0b01110010, 0x10,0x20]);
findInst([0b01110010, 0x10,0x20]);
findInst([0b01110110, 0x10,0x20]);
findInst([0b01110110, 0x10,0x20]);
findInst( [0b01110010, 0x10,0x20]);
findInst([0b11100011, 0x10,0x20]);
findInst([0b01110100, 0x10,0x20]);
findInst([0b01110100, 0x10,0x20]);
findInst([0b01111111, 0x10,0x20]);
findInst([0b01111111, 0x10,0x20]);
findInst([0b01111101, 0x10,0x20]);
findInst([0b01111101, 0x10,0x20]);
findInst([0b01111100, 0x10,0x20]);
findInst([0b01111100, 0x10,0x20]);
findInst([0b01111110, 0x10,0x20]);
findInst([0b01111110, 0x10,0x20]);
findInst([0b01110011, 0x10,0x20]);
findInst([0b01110101, 0x10,0x20]);
findInst([0b01110101, 0x10,0x20]);
findInst([0b01110001, 0x10,0x20]);
findInst([0b01111001, 0x10,0x20]);
findInst([0b01111101, 0x10,0x20]);
findInst([0b01111101, 0x10,0x20]);
findInst([0b01110000, 0x10,0x20]);
findInst([0b01111010, 0x10,0x20]);
findInst([0b01111111, 0x10,0x20]);
findInst([0b01111000, 0x10,0x20]);
//findInst([0b11001100])()
//findInst([0b11001101, 90])()