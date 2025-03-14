import {
    IInstruction,
    ISetInstruction,
    InstructionConfig,
    InstructionFrom,
    ConstSetInstruction, InstructionSet, Config
} from "./helper/instruction";
import TCPU, {
    CALLSet,
    IASet,
    IOMRSet,
    IRMOSet,
    RSet,
    RMMSet,
    ESCSet,
    IOSet,
    INTSet,
    JSet,
    JMPSet, LSet, AAASet, AADSet, AAMSet, ADCSet, AASSet, ADDSet, ANDSet, CBWSet, CLCSet, CLDSet, CMCSet, CLISet
} from "./devices/cpu/tcpu";
import {deepEqual} from "node:assert";
import {cpus} from "node:os";

let cpu = new TCPU('temp');
function toHex(n:number|string, option?: {
    radix?:number,
    pad?:number,
}):string{
    if(typeof n == "string"){
        n = parseInt(n, option?.radix);
    }
    return n.toString(16).toUpperCase().padStart(option?.pad??2, '0');
}



function todo(this:Config, cpu:TCPU){
    console.log(this);
}
let tmp:ISetInstruction<TCPU>[] = [
    new AAASet(),
    new AADSet(),
    new AAMSet(),
    new AASSet(),
    new ADCSet(),
    new ADDSet(),
    new ANDSet(),
    new CALLSet<TCPU>(cpu),
    new CBWSet(),
    new CLCSet(),
    new CLDSet(),
    new CLISet(),
    new CMCSet(),
    new RMMSet<TCPU>('CMP','001110', todo),
    new IOMRSet<TCPU>('CMP','100000','111', todo),
    new IASet<TCPU>('CMP','0011110', todo),
    new IASet<TCPU>('CMP','0011110', todo),
    new ConstSetInstruction<TCPU>(['10100110'], 'CMPSB', todo),
    new ConstSetInstruction<TCPU>(['10100111'], 'CMPSW', todo),
    new ConstSetInstruction<TCPU>(['10011001'], 'CWD', todo),
    new ConstSetInstruction<TCPU>(['00100111'], 'DAA', todo),
    new ConstSetInstruction<TCPU>(['00101111'], 'DAS', todo),
    new IRMOSet('DEC', '1111111', '001', todo),
    new RSet('DEC', '01001',true, todo),
    new IRMOSet('DIV', '1111011', '110', todo),
    new ESCSet(todo),
    new ConstSetInstruction<TCPU>(['11110100'], 'HLT', todo),
    new IRMOSet('IDIV', '1111011', '111', todo),
    new IRMOSet('IMUL', '1111011', '101', todo),
    new IOSet('IN', '1110010', '1110110', todo),
    new IRMOSet('INC', '1111111', '000', todo),
    new RSet('INC', '01000',true, todo),
    new INTSet(todo),
    new ConstSetInstruction<TCPU>(['11001110'], 'INTO', todo),
    new ConstSetInstruction<TCPU>(['11001111'], 'IRET', todo),
    new JSet('JA',  'JNBE',  '01110111', todo, cpu),
    new JSet('JAE', 'JNB',   '01110011', todo, cpu),
    new JSet('JB',  'JNAE',  '01110010', todo, cpu),
    new JSet('JBE', 'JNA',   '01110110', todo, cpu),
    new JSet('JC',  'JC',    '01110010', todo, cpu),
    new JSet('JCXZ','JCXZ', '11100011', todo, cpu),
    new JSet('JE',  'JZ',     '01110100', todo, cpu),
    new JSet('JG',  'JNLE',   '01111111', todo, cpu),
    new JSet('JGE', 'JNL',   '01111101', todo, cpu),
    new JSet('JL',  'JNGE',   '01111100', todo, cpu),
    new JSet('JLE', 'JNG',   '01111110', todo, cpu),
    new JMPSet(todo, cpu),
    new JSet('JNC', 'JNC',   '01110011', todo, cpu),
    new JSet('JNE', 'JNZ',   '01110101', todo, cpu),
    new JSet('JNO', 'JNO',   '01110001', todo, cpu),
    new JSet('JNS', 'JNS',   '01111001', todo, cpu),
    new JSet('JNP', 'JPO',   '01111011', todo, cpu),
    new JSet('JO',  'JO',     '01110000', todo, cpu),
    new JSet('JP',  'JPE',    '01111010', todo, cpu),
    new JSet('JS',  'JS',     '01111000', todo, cpu),
    new ConstSetInstruction(['10011111'],'LAHF', todo ),
    new LSet('LDS', '11000101', true, true, todo),
    new LSet('LEA', '10001101', true, true, todo),
    new LSet('LES', '11000100', true, true, todo),
    new ConstSetInstruction(['11110000'],'LOCK', todo ),
    new ConstSetInstruction(['10101100'],'LODSB', todo ),
    new ConstSetInstruction(['10101101'],'LODSW', todo ),
    new JSet('LOOP', 'LOOP', '11100010', todo, cpu),
    new JSet('LOOPE', 'LOOPZ', '11100001', todo, cpu),
    new JSet('LOOPNZ', 'LOOPNE', '11100000', todo, cpu),

];


//console.log(cpu.getMem8(0).toString(16), cpu.getMem8(1).toString(16))
//console.log(cpu.getMem16(0).toString(16))
cpu.SP = 0xE4;
cpu.DS = 0x401D;
cpu.ES = 0x401D;
cpu.SS = 0x4B16;
cpu.CS = 0x402D;
[0x00, 0x00, 0x2C, 0x40].forEach((v, i)  => {
    cpu.setMem8(v, i);
});

let t: any = [0xFF ,0b11011000];
function sub_arr<T>(start:number,arr:T[]):T[]{
    return arr.filter((_, i) => i + 1 > start);
}
function check(t:number[]) {
    let last = tmp.find(s => s.test(t));
    function hex(bin: string[]): string[] {
        if(!bin) return  [];
        return bin.map(b => parseInt(b, 2).toString(16).padStart(2, '0'.toUpperCase()));
    }
    if (last?.test(t)) {
        let i = last?.instruction(t);
        if (i) {
            console.log(cpu.status());
            console.log('INT',t, hex(i.bin), i.asm,);
            i.exec(cpu);
            console.log(cpu.status());
            let ai = last?.instruction(i.asm);
            let bi = last?.instruction(i.bin);
            console.log('ASM', hex(ai?.bin!), ai?.asm);
            console.log('BIN', hex(bi?.bin!), bi?.asm);
            if(ai?.bin.length){
                check(sub_arr(i?.bin.length, t));
            }

        } else {
            console.log('Not found instruction!', t);
        }
    }
    else {
        console.log("END", t)
    }
}
// function check2(t:string) {
//     let last = tmp.find(s => s.test(t));
//     function hex(bin: string[]): string[] {
//         if(!bin) return  [];
//         return bin.map(b => parseInt(b, 2).toString(16).padStart(2, '0'.toUpperCase()));
//     }
//     if (last?.test(t)) {
//         let i = last?.instruction(t);
//         if (i) {
//             console.log('INT', hex(i.bin), i.asm);
//             let ai = last?.instruction(i.asm);
//             let bi = last?.instruction(i.bin);
//             console.log('ASM', hex(ai?.bin!), ai?.asm);
//             console.log('BIN', hex(bi?.bin!), bi?.asm);
//         } else {
//             console.log('Not found instruction!', t);
//         }
//     }
//     else {
//         console.log("END", t)
//     }
// }
check(t)

console.log(cpu.showMem(cpu.SS, cpu.SP))