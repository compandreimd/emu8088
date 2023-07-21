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
    console.log("===INT===")
    findInst([0b11001100])
    findInst([0b11001101, 0x10])
    console.log("===INT0===")
    findInst([0b11001110, 0x10])
    console.log("===IRET==")
    findInst([0b11001111, 0x10])
    console.log(`===JXX===`)
    findInst([0x70, 0xFE]) //JO  OF = 1
    findInst([0x71, 0xFD]) //JNO OF = 0
    findInst([0x72, 0x00]) //JB  CF = 1
    findInst([0x73, 0x00]) //JNB CF = 0
    findInst([0x74, 0x00]) //JE  ZF = 1
    findInst([0x75, 0x00]) //JNE ZF = 0
    findInst([0x76, 0x00]) //JBE CF | ZF = 1
    findInst([0x77, 0x00]) //JA  CF & ZF = 0
    findInst([0x78, 0x00]) //JS  SF = 1
    findInst([0x79, 0x00]) //JNS SF = 0
    findInst([0x7A, 0x00]) //JP  OF = 0
    findInst([0x7B, 0x00]) //JNP PF = 0
    findInst([0x7C, 0x00]) //JL  SF <> OF
    findInst([0x7D, 0x00]) //JNL SF = OF
    findInst([0x7E, 0x00]) //JLE SF <> OF | ZF = 1
    findInst([0x7F, 0x00]) //JG   (SF = OF) & (ZF = 0)
    findInst([0xE3, 0x00]) //JCXZ  CX = 0
    console.log(`==JMP===`)
    findInst([0b11101001, 2, 2])
    findInst([0b11101011, 0xCD])
    findInst([0b11111111, 0b10100000, 10, 20])
    findInst([0b11101010, 1, 2, 3,4])
    findInst([0b11111111, 0b10101000, 20, 10])


}
cpu.AX.Value = 0;
cpu.BX.Value = 2;
cpu.CX.Value = 0;
cpu.DX.Value = 0;
findInst([0b10011111, 0b11101000, 20, 10])()

console.log(cpu.AH.Value.toString(16).padStart(2, '0'));
//f()



