import {
    IInstruction,
    ISetInstruction,
    InstructionConfig,
    InstructionFrom,
    ConstSetInstruction, InstructionSet, Config
} from "./helper/instruction";
import TCPU, {
    CALLSet,
    ESCSet,
    INTSet,
    AAASet,
    AADSet,
    AAMSet,
    ADCSet,
    AASSet,
    ADDSet,
    ANDSet,
    CBWSet,
    CLCSet,
    CLDSet,
    CMCSet,
    CLISet,
    CMPSet,
    CMPSSet,
    CWDSet,
    DAASet,
    DASSet,
    DECSet,
    DIVSet,
    HLTSet,
    IMULSet,
    IDIVSet,
    INSet,
    INCSet,
    INTOSet,
    IRETSet,
    JASet,
    JNBESet,
    JAESet,
    JNBSet,
    JBSet,
    JNAESet,
    JBESet,
    JNASet,
    JCSet,
    JCXZSet,
    JESet,
    JZSet,
    JGSet,
    JNLESet,
    JGESet,
    JNLSet,
    JLSet,
    JNGESet,
    JLESet,
    JNGSet,
    JMPSet,
    JNCSet,
    JNESet,
    JNZSet,
    JNOSet,
    JNSSet,
    JNPSet,
    JPOSet,
    JOSet,
    JPSet,
    JPESet,
    JSSet,
    LAHFSet,
    LDSSet,
    LEASet,
    LESSet,
    LOCKSet,
    LODSSet,
    LOOPSet,
    LOOPESet,
    LOOPZSet, LOOPNZSet, LOOPNESet, MOVSet,
} from "./devices/cpu/tcpu";
let cpu = new TCPU('temp');

function toHex(n: number | string, option?: {
    radix?: number,
    pad?: number,
}): string {
    if (typeof n == "string") {
        n = parseInt(n, option?.radix);
    }
    return n.toString(16).toUpperCase().padStart(option?.pad ?? 2, '0');
}


function todo(this: Config, cpu: TCPU) {
    console.log(this);
}

let tmp: ISetInstruction<TCPU>[] = [
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
    new CMPSet(),
    new CMPSSet(),
    new CWDSet(),
    new DAASet(),
    new DASSet(),
    new DECSet(),
    new DIVSet(),
    new ESCSet(),
    new HLTSet(),
    new IMULSet(),
    new IDIVSet(),
    new INSet(),
    new INCSet(),
    new INTSet(),
    new INTOSet(),
    new IRETSet(),
    new JASet(cpu), new JNBESet(cpu),
    new JAESet(cpu), new JNBSet(cpu),
    new JBSet(cpu), new JNAESet(cpu),
    new JBESet(cpu), new JNASet(cpu),
    new JCSet(cpu),
    new JCXZSet(cpu),
    new JESet(cpu), new JZSet(cpu),
    new JGSet(cpu), new JNLESet(cpu),
    new JGESet(cpu), new JNLSet(cpu),
    new JLSet(cpu), new JNGESet(cpu),
    new JLESet(cpu), new JNGSet(cpu),
    new JMPSet(cpu),
    new JNCSet(cpu),
    new JNESet(cpu), new JNZSet(cpu),
    new JNOSet(cpu),
    new JNSSet(cpu),
    new JNPSet(cpu), new JPOSet(cpu),
    new JOSet(cpu),
    new JPSet(cpu), new JPESet(cpu),
    new JSSet(cpu),
    new LAHFSet(),
    new LEASet(),
    new LDSSet(),
    new LESSet(),
    new LOCKSet(),
    new LODSSet(),
    new LOOPSet(cpu),
    new LOOPZSet(cpu),
    new LOOPESet(cpu),
    new LOOPNESet(cpu),
    new LOOPNZSet(cpu),
    new MOVSet(),
];

function check(t: any, option?: {run?:boolean, data?:boolean}) {
    let last = tmp.find(s => s.test(t));

    function hex(bin: string[]): string[] {
        if (!bin) return [];
        return bin.map(b => parseInt(b, 2).toString(16).padStart(2, '0'.toUpperCase()));
    }

    if (last?.test(t)) {
        let i = last?.instruction(t);
        if (i) {
         //   console.log(cpu.status());
            if(option?.data) console.log('DATA', t);
            console.log('XXX', hex(i.bin), i.asm);
            if(option?.run){
                i.exec(cpu);
                console.log(cpu.status());
            }
            let ai = last?.instruction(i.asm);
            let bi = last?.instruction(i.bin);
            console.log('ASM', hex(ai?.bin!), ai?.asm);
            console.log('BIN', hex(bi?.bin!), bi?.asm);
        } else {
            console.log('Not found instruction!', t);
        }
        return i;
    } else {
        console.log("END", t)
    }
}
cpu.setMem16(0x1020)
console.log(check(['10001110', '00 011 000', '00000000', '00100010'].map(x => x.replace(/\s+/mg, '')), {run: true}));
console.log(cpu.getMem16(0).toString(16))