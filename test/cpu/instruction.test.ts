import TCPU, {
    AAASet,
    AADSet,
    AAMSet,
    AASSet,
    ADCSet,
    ADDSet,
    ANDSet,
    CALLSet,
    CBWSet,
    CLCSet,
    CLDSet,
    CLISet,
    CMCSet,
    CMPSet,
    CMPSSet,
    CWDSet,
    DAASet,
    DASSet,
    DECSet,
    DIVSet,
    ESCSet,
    HLTSet, IDIVSet,
    IMULSet, INSet, Reg8
} from "../../src/devices/cpu/tcpu";

let RM_Key = ['BX+SI', 'BX+DI', 'BP+SI', 'BP+DI', 'SI', 'DI', 'BP', 'BX'];
let Reg8_Key = ["AL", "CL", "DL", "BL", "AH", "CH", "DH", 'BH'];
let Reg16_Key = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"];
import {deepEqual, deepStrictEqual, doesNotMatch, throws} from "node:assert";
import {IInstruction, InstructionSet, ISetInstruction} from "../../src/helper/instruction";

const cpu = new TCPU("cpu");
const instructions: ISetInstruction<TCPU>[] = [
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
    new INSet()
];

function su(n: number, bits: number) {
    if (n >= 0) {
        return n;
    } else {
        return n + (1 << bits);
    }
}

function us(n: number, bits: number) {
    const maxSigned = (1 << (bits - 1)) - 1; // e.g., 127 for 8-bit
    if (n <= maxSigned) {
        return n;
    } else {
        return n - (1 << bits);
    }

}


describe('Instruction', () => {
    const list: {
        [p: string]: {
            dec?: number[],
            set: ISetInstruction<TCPU>
            asm?: string,
            run?: (i: IInstruction<TCPU>) => void,
        }
    } = {
        AAA: {
                set: new AAASet(),
                dec: [0b00110111],
                asm: "AAA",
                run: (i: IInstruction<TCPU>) => {
                    cpu.AX = 0x6C;
                    cpu.IP = 0;
                    i.exec(cpu);
                    deepEqual({al: 0x02, ah: 0x01, ax: 0x0102, cf: 1, ip: 1},
                        {al: cpu.AL, ah: cpu.AH, ax: cpu.AX, cf: cpu.CF, ip: cpu.IP})
                }
            },
        AAD: {
            set: new AADSet(),
            dec: [0b11010101, 0b00001010],
            asm: "AAD",
            run: (i: IInstruction<TCPU>) => {
                cpu.AX = 0x0507;
                cpu.IP = 0;
                i.exec(cpu);
                deepEqual({al: 0x39, ah: 0x00, ax: 0x39, zf: 0, sf: 0, pf: 1, ip: 2},
                    {al: cpu.AL, ah: cpu.AH, ax: cpu.AX, zf: cpu.ZF, sf: cpu.SF, pf: cpu.PF, ip: cpu.IP})
            }
        },
        AAM: {
            set: new AAMSet(),
            dec: [0b11010100, 0b00001010],
            asm: "AAM",
            run: (i: IInstruction<TCPU>) => {
                cpu.AL = 0x3F;
                cpu.IP = 0;
                i.exec(cpu);
                deepEqual({al: 0x03, ah: 0x06, ax: 0x0603, zf: 0, sf: 0, pf: 1, ip: 2},
                    {al: cpu.AL, ah: cpu.AH, ax: cpu.AX, zf: cpu.ZF, sf: cpu.SF, pf: cpu.PF, ip: cpu.IP})
            }
        },
        AAS: {
            set: new AASSet(),
            dec: [0b00111111],
            asm: "AAS",
            run:(i:IInstruction<TCPU>) => {
                cpu.AL = 0x03;
                i.exec(cpu);
                deepEqual({al: 0x03, ah: 0x06, ax: 0x0603, cf:0, af:0, ip: 1},
                    {al: cpu.AL, ah: cpu.AH, ax: cpu.AX, cf:cpu.CF, af:cpu.AF, ip: cpu.IP})
            }
        },
        //ADC: {asm: "ADC"}
    };

    beforeEach(() => {
        cpu.DS = 0x401D;
        cpu.ES = 0x401D;
        cpu.SS = 0x4B16;
        cpu.CS = 0x402D;
        cpu.IP = 0;
    });
    test('Status', () => {
        let status = cpu.status();
        let str = "┌─────┬─────┬─────┬─────┬────┬────┬────┬────┬────┬────┬────┬────┬─────────────────┬────┐\n";
        str += "│ AX  │ BX  │ CX  │ DX  │    │    │    │    │    │    │    │    │      FLAGS      │    │\n"
        str += "├──┬──┼──┬──┼──┬──┼──┬──┤ SI │ DI │ BP │ SP │ DS │ ES │ SS │ CS ├─┬─┬─┬─┬─┬─┬─┬─┬─┤ IP │\n"
        str += "│AH│AL│BH│BL│CH│CL│DH│DL│    │    │    │    │    │    │    │    │C│Z│S│O│P│A│I│D│T│    │\n"
        str += "├──┼──┼──┼──┼──┼──┼──┼──┼────┼────┼────┼────┼────┼────┼────┼────┼─┼─┼─┼─┼─┼─┼─┼─┼─┼────┤\n"
        str += "│" + cpu.AH.toString(16).padStart(2, '0') + "│" + cpu.AL.toString(16).padStart(2, '0') + ""
        str += "│" + cpu.BH.toString(16).padStart(2, '0') + "│" + cpu.BL.toString(16).padStart(2, '0') + ""
        str += "│" + cpu.CH.toString(16).padStart(2, '0') + "│" + cpu.CL.toString(16).padStart(2, '0') + ""
        str += "│" + cpu.DH.toString(16).padStart(2, '0') + "│" + cpu.DL.toString(16).padStart(2, '0') + ""
        str += "│" + cpu.SI.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.DI.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.BP.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.SP.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.DS.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.ES.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.SS.toString(16).padStart(4, '0') + ""
        str += "│" + cpu.CS.toString(16).padStart(4, '0') + ""
        str += "|" + (cpu.CF ? "1" : "0");
        str += "|" + (cpu.ZF ? "1" : "0");
        str += "|" + (cpu.SF ? "1" : "0");
        str += "|" + (cpu.OF ? "1" : "0");
        str += "|" + (cpu.PF ? "1" : "0");
        str += "|" + (cpu.AF ? "1" : "0");
        str += "|" + (cpu.IF ? "1" : "0");
        str += "|" + (cpu.DF ? "1" : "0");
        str += "|" + (cpu.TF ? "1" : "0");
        str += "│" + cpu.IP.toString(16).padStart(4, '0') + ""
        str += "│\n";
        str += "└──┴──┴──┴──┴──┴──┴──┴──┴────┴────┴────┴────┴────┴────┴────┴────┴─┴─┴─┴─┴─┴─┴─┴─┴─┴────┘\n";
        deepEqual(status, str)
    })
    test("AAA", () => {
        let {asm, dec, set, run} = list.AAA;
        deepEqual(set.test(asm!), true);
        deepEqual(set.test(dec!), true);
        deepEqual(set.test(dec!.map(x => x.toString(2).padStart(8, '0'))), true);
        deepEqual(set.test(dec!.map(x => x.toString(16).padStart(2, '0'))), true);
        let i = set.instruction(asm!)!;
        deepEqual(i.asm, asm!);
        deepEqual(i.dec, dec!);
        deepEqual(i.size, 1);
        run!.call(set, i);
    })
    test("AAD", () => {
        let {asm, dec, set, run} = list.AAD;
        deepEqual(set.test(asm!), true);
        deepEqual(set.test(dec!), true);
        deepEqual(set.test(dec!.map(x => x.toString(2).padStart(8, '0'))), true);
        deepEqual(set.test(dec!.map(x => x.toString(16).padStart(2, '0'))), true);
        let i = set.instruction(asm!)!;
        deepEqual(i.asm, asm!);
        deepEqual(i.dec, dec!);
        deepEqual(i.size, 2);
        run!.call(set, i);
    })
    test("AAM", () => {
        let {asm, dec, set, run} = list.AAM;
        deepEqual(set.test(asm!), true);
        deepEqual(set.test(dec!), true);
        deepEqual(set.test(dec!.map(x => x.toString(2).padStart(8, '0'))), true);
        deepEqual(set.test(dec!.map(x => x.toString(16).padStart(2, '0'))), true);
        let i = set.instruction(asm!)!;
        deepEqual(i.asm, asm!);
        deepEqual(i.dec, dec!);
        deepEqual(i.size, 2);
        run!.call(set, i);
    })
    test("AAS", () => {
        let {asm, dec, set, run} = list.AAS;
        deepEqual(set.test(asm!), true);
        deepEqual(set.test(dec!), true);
        deepEqual(set.test(dec!.map(x => x.toString(2).padStart(8, '0'))), true);
        deepEqual(set.test(dec!.map(x => x.toString(16).padStart(2, '0'))), true);
        let i = set.instruction(asm!)!;
        deepEqual(i.asm, asm!);
        deepEqual(i.dec, dec!);
        deepEqual(i.size, 1);
        run!.call(set, i);
    })

})