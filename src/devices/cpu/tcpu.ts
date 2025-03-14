import {ACPU} from "./acpu";
import Memory from "../mem/memory";
import {
    Config, ConstSetInstruction, DefInst,
    IInstruction,
    InstructionConfig,
    InstructionFrom,
    InstructionSet,
    ISetInstruction, RawConfig
} from "../../helper/instruction";
import {name} from "ts-jest/dist/transformers/hoist-jest";
import {throws} from "node:assert";

export enum FLAGS {
    C, //CARRY
    P = 2,  //PARITY
    A = 4,  //AUXILIARY CARRY
    Z = 6,  //ZERO
    S, //SIGN
    T, //TRAP
    I, //INTERRUPT
    D,//DIRECTION
    O //OVERFLOW
}

export enum ALL {
    AX,
    CX,
    DX,
    BX,
    SP,
    BP,
    SI,
    DI,
    ES,
    CS,
    SS,
    DS,
    IP,
    FLAGS
}

type EnumReg = { index: number, asm: string, bin: string };

enum Reg16 { AX, CX, DX, BX, SP, BP, SI, DI}

let Reg16_Key = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"];

export enum Reg8 { AL, CL, DL, BL, AH, CH, DH, BH}

let Reg8_Key = ["AL", "CL", "DL", "BL", "AH", "CH", "DH", 'BH'];

enum Seg { ES, CS, SS, DS}

let Seg_Key = ['ES', 'CS', 'SS', 'DS'];

enum RM { BX_SI, BX_DI, BP_SI, BP_DI, SI, DI, BP, BX}

let RM_Key = ['BX\\s*\\+\\s*SI', 'BX\\s*\\+\\s*DI', 'BP\\s*\\+\\s*SI', 'BP\\s*\\+\\s*DI', 'SI', 'DI', 'BP', 'BX'];

enum D {L, R}

enum W {BYTE, WORD}

enum MOD {ZERO, DISP, DISP2, REG}

export type GetterAndSetter = {
    name: string
    get value(): number;
    set value(value: number);
    next?:GetterAndSetter;
}

type Helper = {
    asm: (config: InstructionConfig) => string,
    bin: (config: InstructionConfig) => string[],
    asmReg: InstructionSet[],
    binReg: InstructionSet[]
};

abstract class HelperSet<CPU extends TCPU> implements ISetInstruction<CPU> {
    private _bin: InstructionSet[];
    private _asm: InstructionSet[];
    private _defConfig: InstructionConfig;
    private _execute: any;
    private _max: number | undefined;
    protected static _asDOSBOX = true;
    static RM00 = `\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`;

    get max(): number {
        if (!this._max)
            this._max = this._bin.map(x => x.str.length).reduce((p, c) => {
                return p > c ? p : c;
            }, 0);
        return this._max;
    }

    constructor(bin: InstructionSet[], asm: InstructionSet[], defConfig: InstructionConfig, e: any) {
        this._bin = bin;
        this._asm = asm;
        this._defConfig = defConfig;
        this._execute = e;
    }

    get asmReg(): InstructionSet[] {
        return this._asm;
    }

    get binReg(): InstructionSet[] {
        return this._bin;
    }

    raws(from: InstructionFrom | CPU, offset?: number): RawConfig[] {
        let raw: RawConfig[] = [];
        if (typeof from == "string") {
            let asm = this.asmReg;
            for (let i = 0; i < asm.length; i++) {
                if (asm[i].test([from]))
                    raw.push(asm[i].config([from])!);
            }
        } else if (from instanceof Array) {
            let bins: string[];
            let bin = this.binReg;
            try {
                if (typeof from[0] == 'number')
                    bins = from.map(t => t.toString(2).padStart(8, '0'));
                else
                    bins = from as string[];
                if (ConstSetInstruction.r_hex.test(bins[0]) && bins[0].length <= 2)
                    bins = bins.map(b => parseInt(b.toString(), 16).toString(2).padStart(8, '0'));
                for (let i = 0; i < bin.length; i++) {
                    if (bin[i].test(bins)) raw.push(bin[i].config(bins)!);
                }
            } catch (ex: any) {


            }
        } else if (from instanceof ACPU) {
            let data: number[] = [];
            for (let i = 0; i < this.max; i++) {
                data[i] = from.getCode(i);
            }
            return this.raws(data);
        } else {
            throw new Error('Not implemented');
        }

        return raw;
    }

    protected static calculateParity(byte: number): boolean {
        let count = 0;
        for (let i = 0; i < 8; i++) {
            if (byte & (1 << i)) count++;
        }
        return (count % 2) === 0;

    }

    protected static calculateCarryFlag(result: number, bits: number): boolean {
        const max = (1 << bits) - 1; // 0xFF for 8-bit, 0xFFFF for 16-bit
        return result > max;
    }

    protected static calculateZeroFlag(result: number): boolean {
        return result === 0;
    }

    protected static calculateSignFlag(result: number, bits: number): boolean {
        const mask = 1 << (bits - 1); // 0x80 for 8-bit, 0x8000 for 16-bit
        return (result & mask) !== 0;
    }

    protected static calculateOverflowFlag(result: number, bits: number): boolean {
        const max = (1 << (bits - 1)) - 1; // 127 for 8-bit, 32767 for 16-bit
        const min = -(1 << (bits - 1));    // -128 for 8-bit, -32768 for 16-bit
        return result < min || result > max;
    }

    protected static calculateParityFlag(result: number): boolean {
        let count = 0;
        for (let i = 0; i < 8; i++) {
            if (result & (1 << i)) count++;
        }
        return (count % 2) === 0;
    }

    protected static calculateAuxiliaryCarryFlag(a: number, b: number, bits: number, c?: number) {
        const mask = 0x10; // Check bit 4 (carry out of bit 3)
        return ((a & 0xF) + (b & 0xF) + (c ? c : 0)) & mask;
    }

    protected static UpdateFlags<CPU extends TCPU>(value: number, bits: number, cpu: CPU, flags: Set<FLAGS>): void {
        if (flags.has(FLAGS.C))
            cpu.CF = HelperSet.calculateCarryFlag(value, bits) ? 1 : 0;
        if (flags.has(FLAGS.Z))
            cpu.ZF = HelperSet.calculateZeroFlag(value) ? 1 : 0;
        if (flags.has(FLAGS.S))
            cpu.SF = HelperSet.calculateSignFlag(value, bits) ? 1 : 0;
        if (flags.has(FLAGS.O))
            cpu.OF = HelperSet.calculateOverflowFlag(value, bits) ? 1 : 0;
        if (flags.has(FLAGS.P))
            cpu.PF = HelperSet.calculateParityFlag(value) ? 1 : 0;
        //OLD // Carry Flag (CF)
        // if(flags.has(FLAGS.C)) {
        //     if (other?.operands?.length) {
        //         if(other.operands[2] == 0){
        //             if(other.w)
        //                 cpu.CF = value > 0xFF ? 1 : 0;
        //             else
        //                 cpu.CF =  value > 0xFFFF? 1 : 0;
        //         }
        //         else
        //             cpu.CF = other.operands[0] < other.operands[1] ? 1 : 0;
        //     }
        // }
        // // Zero Flag (ZF)
        // if(flags.has(FLAGS.Z)) {
        //     cpu.ZF = value == 0 ?  1: 0;
        // }
        // // Sign Flag (SF)
        // if(flags.has(FLAGS.S)){
        //     cpu.SF = value & 0x80 ? 1 : 0;
        // }
        // // Overflow Flag (OF)
        // if(flags.has(FLAGS.O)){
        //     if (other?.operands?.length) {
        //         if(other.operands[2] == 0){
        //             cpu.OF = (((other.operands[0] ^ value) & (other.operands[1] ^ value) & 0x80) !== 0) ? 1 : 0;
        //         }
        //         else
        //             cpu.CF = (((other.operands[0] ^ other.operands[1]) & (other.operands[1] ^ value) & 0x80) !== 0) ? 1 : 0;
        //     }
        // }
        // // Parity Flag (PF)
        // if(flags.has(FLAGS.P)) {
        //     cpu.PF = HelperSet.calculateParity(value)? 1 : 0;
        // }

    }

    protected raw(from: InstructionFrom | CPU, offset?: number): RawConfig | undefined {
        if (typeof from == "string") {
            let asm = this.asmReg;
            for (let i = 0; i < asm.length; i++) {
                if (asm[i].test([from]))
                   return  asm[i].config([from]);
            }
        } else if (from instanceof Array) {
            let bins: string[];
            let bin = this.binReg;
            try {
                if (typeof from[0] == 'number')
                    bins = from.map(t => t.toString(2).padStart(8, '0'));
                else
                    bins = from as string[];
                if (ConstSetInstruction.r_hex.test(bins[0]) && bins[0].length <= 2)
                    bins = bins.map(b => parseInt(b.toString(), 16).toString(2).padStart(8, '0'));
                for (let i = 0; i < bin.length; i++) {
                    if (bin[i].test(bins)) return bin[i].config(bins)!;
                }
            } catch (ex: any) {


            }
        } else if (from instanceof ACPU) {
            let data: number[] = [];
            for (let i = 0; i < this.max; i++) {
                data[i] = from.getCode(i);
            }
            return this.raw(data);
        } else {
            throw new Error('Not implemented');
        }

        return undefined;
    }

    protected changeEnum(v: string, E: any, pad?: number): Config {
        if (isNaN(parseInt(v, 2))) {
            return {
                asm: v,
                bin: E[v.replace('+', '_')].toString(2).padStart(pad ?? 3, '0'),
                arg: E[v.replace('+', '_')],
            }
        } else {
            return {
                asm: E[(parseInt(v, 2))].replace('_', '+'),
                bin: v,
                arg: parseInt(v, 2)
            }
        }
    }

    protected changeValue(v: string, v2?: string): Config {
        const isHex = v.length <= 2;
        const n = parseInt(v, isHex ? 16 : 2);
        if (v2) {
            const n2 = parseInt(v2, isHex ? 16 : 2);
            if (isHex)
                return {
                    asm: n.toString(16).padStart(2, '0') + n2.toString(16).padStart(2, '0').toUpperCase(),
                    bin: n2.toString(2).padStart(8, '0') + n.toString(2).padStart(8, '0'),
                };
            else
                return {
                    asm: n2.toString(16).padStart(2, '0') + n.toString(16).padStart(2, '0').toUpperCase(),
                    bin: n.toString(2).padStart(8, '0') + n2.toString(2).padStart(8, '0'),
                };
        }
        return {
            asm: n.toString(16).padStart(2, '0').toUpperCase(),
            bin: n.toString(2).padStart(8, '0'),

        }

    }

    protected changeSigned(v: string): Config {
        const isHex = v.length <= 3;
        if (isHex) {
            let n = parseInt(v, 16);
            if (n < 0) {
                n = 0x100 + n;
            }
            n = n & 0xFF;
            return {
                bin: n.toString(2).padStart(8, '0'),
                asm: (n > 0xC0 ? '-' + (0x100 - n).toString(16).padStart(2, '0').toUpperCase() : '+' + n.toString(16).padStart(2, '0')).toUpperCase(),
            }
        } else {
            let n = parseInt(v, 2);
            return {
                bin: n.toString(2).padStart(8, '0'),
                asm: (n > 0xC0 ? '-' + (0x100 - n).toString(16).padStart(2, '0').toUpperCase() : '+' + n.toString(16).padStart(2, '0')).toUpperCase(),
            }
        }
    }

    protected asm(config: InstructionConfig): string {
        throw new Error('Not implemented');
    }

    protected bin(config: InstructionConfig): string[] {
        throw new Error('Not implemented');
    }

    config(from?: InstructionFrom | CPU, offset?: number): InstructionConfig | undefined {
        if (!from) return undefined;
        let raw = this.raw(from, offset);
        if (!raw) return undefined;
        let config: InstructionConfig = {};
        for (let k in this._defConfig) {
            config[k] = {
                asm: this._defConfig[k].asm,
                bin: this._defConfig[k].bin,
            }
        }
        for (let k in raw) {
            switch (k) {
                case 'd':
                    config[k] = this.changeEnum(raw[k], D, 1);
                    break;
                case 'w':
                    config[k] = this.changeEnum(raw[k], W, 1);
                    break;
                case 'mod':
                    config[k] = this.changeEnum(raw[k], MOD, 2);
                    break;
                case 'rm':
                    if (raw['mod'] == '11' || raw['mod'] == 'REG') {
                        const Reg = raw['w'] == '0' || raw['w'] == 'BYTE' ? Reg8 : Reg16;
                        config[k] = this.changeEnum(raw[k], Reg);
                    } else {
                        config[k] = this.changeEnum(raw[k], RM);
                    }
                    break;
                case 'seg':
                    config[k] = this.changeEnum(raw[k], Seg);
                    break;
                case 'reg':
                    const Reg = raw['w'] == '0' || raw['w'] == 'BYTE' ? Reg8 : Reg16;
                    config[k] = this.changeEnum(raw[k], Reg);
                    break;
                case 'port':
                    config[k] = this.changeValue(raw[k])
                    break;
                case 'val':
                    if (raw['s'] == '1') {
                        config[k] = this.changeSigned(raw[k]);
                    } else
                        config[k] = this.changeValue(raw[k], raw[k + '2']);
                    break;
                case 'w_reg':
                    switch (raw['w_reg']) {
                        case 'AX':
                            config[k] = {asm: 'AX', bin: '1'};
                            break;
                        case 'AH':
                            config[k] = {asm: 'AX', bin: '1'};
                            break;
                        default:
                            config[k] = {asm: raw['w_reg'], bin: raw['w_reg']};
                    }
                    break;
                case 'ea':
                    config[k] = this.changeValue(raw[k], raw[k + '2']);
                    break;
                case 'disp':
                    if (config['mod'].bin == '01') {
                        config[k] = this.changeSigned(raw[k]);
                    } else {
                        config[k] = this.changeValue(raw[k], raw[k + '2']);
                    }
                    break;
                default:
                    config[k] = {
                        asm: raw[k],
                        bin: raw[k],
                    }
                    break;
                case 'code':
                case 'ea2':
                case 'val2':
                case 'disp2':
            }

        }
        return config;
    }

    test(from?: InstructionFrom | CPU, offset?: number): boolean {
        if (from)
            return !!this.raw(from, offset);
        return false;
    }

    instruction(from: InstructionFrom | CPU, offset?: number): IInstruction<CPU> | undefined {
        let config = this.config(from, offset);
        if (!config) return undefined;
        let exec = this._execute.bind(config);
        return new DefInst(this.asm(config), this.bin(config), exec)
    }

    protected static get_setReg<CPU extends TCPU>(cpu: CPU, w: boolean, reg: ALL | Reg8,): GetterAndSetter {
        if (w)
            return {
                name: ALL[reg],
                get value() {
                    return cpu.get16(reg as ALL);
                },
                set value(value: number) {
                    cpu.set16(reg as ALL, value);
                }
            }
        else return {
            name: Reg8[reg],
            get value() {
                return cpu.get8(reg as Reg8);
            },
            set value(value: number) {
                cpu.set8(reg as Reg8, value);
            }
        }
    }

    protected static get_setAddr<CPU extends TCPU>(cpu: CPU, w: boolean, offset: number, seg?: number): GetterAndSetter {
        if (w)
            return {
                name: `[${seg ?? 'DS'}:${offset}]`,
                get value() {
                    return cpu.getMem16(offset, seg);
                },
                set value(value: number) {
                    cpu.setMem16(offset, seg, value);
                },
                next : {
                    name: `[${seg ?? 'DS'}:${offset+2}]`,
                    get value() {
                        return cpu.getMem16(offset + 2, seg);
                    },
                    set value(value: number) {
                        cpu.setMem16(offset + 2, seg, value);
                    },
                }
            }
        else return {
            name: `[${seg ?? 'DS'}:${offset}]`,
            get value() {
                return cpu.getMem8(offset, seg);
            },
            set value(value: number) {
                cpu.setMem8(offset, seg, value);
            },
            next : {
                name: `[${seg ?? 'DS'}:${offset + 1}]`,
                get value() {
                    return cpu.getMem8(offset + 1, seg);
                },
                set value(value: number) {
                    cpu.setMem8(offset + 1, seg, value);
                },
            }
        }
    }

    protected static reg<CPU extends TCPU>(cpu: CPU, config: InstructionConfig) {
        return HelperSet.get_setReg(cpu, config.w.bin === '1', config.reg.arg);
    }

    protected static rm<CPU extends TCPU>(cpu: CPU, config: InstructionConfig) {
        if (config.mod.bin == '11')
            return HelperSet.get_setReg(cpu, config.w.bin === '1', config.rm.arg);
        else {
            let addr = config.disp ? parseInt(config.disp.asm!, 16) : 0;
            let seg = undefined;
            switch (config.rm.bin) {
                case '000':
                    addr += cpu.BX + cpu.SI;
                    break;
                case '001':
                    addr += cpu.BX + cpu.DI;
                    break;
                case '010':
                    addr += cpu.BP + cpu.SI;
                    seg = cpu.SS;
                    break;
                case '011':
                    addr += cpu.BP + cpu.DI;
                    seg = cpu.SS;
                    break;
                case '100':
                    addr += cpu.SI;
                    break;
                case '101':
                    addr += cpu.DI;
                    break;
                case '110':
                    if (config.mod.bin == '00')
                        addr += parseInt(config.ea.asm!, 16)
                    else {
                        addr += cpu.BP;
                        seg = cpu.SS;
                    }
                    break;
                case '111':
                    addr += cpu.BX;
                    break;
            }
            return HelperSet.get_setAddr(cpu, config.w.bin === '1', addr, seg);
        }
    }
    // private static stackStart:number = 0xFFFF;
    // private static stackEnd:number = 0xFF00;

    protected static pop<CPU extends TCPU>(cpu:CPU):number {
        // if (cpu.SP >= this.stackStart) {
        //     throw new Error("Stack underflow");
        // }
        const value = cpu.getMem16(cpu.SP, cpu.SS);
        cpu.SP += 2;
        return value;
    }
    protected static push<CPU extends TCPU>(cpu:CPU, value: number) {
        // if (cpu.SP < this.stackEnd) {
        //     throw new Error("Stack overflow");
        // }
        cpu.SP -= 2;
        cpu.setMem16(value, cpu.SP, cpu.SS);
    }

    protected static TR(name: string, code: string): Helper {
        const binReg = [
            new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>000|001|010|011|100|101|111)`], {_: 'tr'}),
            new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>01)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>10)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>11)(?<reg>[01]{3})(?<rm>[01]{3})`], {_: 'tr'}),
        ];
        const asmReg = [
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*(?<rm>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "1", _: "tr"})
        ];
        return {
            asmReg, binReg,
            asm(config: InstructionConfig): string {
                const p1 = config.reg.asm!;
                let disp = config.disp?.asm ?? "";
                if (disp.length == 4) {
                    disp = '+' + disp;
                }
                let p2 = `[${config.rm.asm}${disp}]`;
                if (config.mod.bin == '00' && config.rm.bin == '110') {
                    p2 = `[${config.ea.asm}]`
                }
                if (config.mod.bin == '11') {
                    p2 = config.rm.asm!
                }
                if (config.d.bin == '0')
                    return `${name} ${p2}, ${p1}`
                else
                    return `${name} ${p1}, ${p2}`
            },
            bin(config: InstructionConfig): string[] {
                let list = [code + config.d.bin! + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
                if (config.mod.bin == "00" && config.rm.bin == "110") {
                    list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
                } else if (config.mod.bin == "01") {
                    list.push(config.disp.bin!);
                } else if (config.mod.bin == "10") {
                    list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
                }
                return list;
            }
        };
    }
    protected static TC(name: string, code: string, reg: string): Helper {
        const binReg = [
            //sw00 sw10
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            //sw01
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            //sw11
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`
            ], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`], {reg: reg, _: 'tc'}),
        ];
        const asmReg = [
            //sw00
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '11',
                w: '0'
            }),
            //sw01
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                _: 'tc',
                mod: '11',
                w: '1'
            }),
            //sw10 sw11
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[+-][0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '11',
                w: '0'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[+-][0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                _: 'tc',
                mod: '11',
                w: '1'
            }),

        ];
        return {
            asmReg, binReg,
            asm(config: InstructionConfig): string {
                let addr = config.mod.bin == '00' && config.rm.bin == '110' ? config.ea.asm : config.rm.asm;
                if (config.mod.bin == '11') {
                    return `${name} ${config.rm.asm}, ${config.val.asm}`;
                }
                return `${name} ${config.w.asm} PTR [${addr}${config.disp ? ((config.mod.bin == '10' ? '+' : '') + config.disp.asm) : ''}], ${config.val.asm}`;
            },
            bin(config: InstructionConfig): string[] {
                let bins = [
                    `${code}${config.s.bin}${config.w.bin}`,
                    `${config.mod.bin}${config.reg.bin}${config.rm.bin}`];
                if (config.mod.bin == '00' && config.rm.bin == '110') {
                    bins.push(`${config.ea.bin?.substring(0, 8)}`);
                    bins.push(`${config.ea.bin?.substring(8)}`);
                }
                if (config.mod.bin == '01') {
                    bins.push(`${config.disp.bin}`);
                }
                if (config.mod.bin == '10') {
                    bins.push(`${config.disp.bin?.substring(0, 8)}`);
                    bins.push(`${config.disp.bin?.substring(8)}`);
                }
                if (config.s.bin == '0' && config.w.bin == '1') {
                    bins.push(`${config.val.bin?.substring(0, 8)}`);
                    bins.push(`${config.val.bin?.substring(8)}`);
                } else {
                    bins.push(`${config.val.bin}`);
                }
                return bins;
            }
        };
    }
    protected static TA(name:string, code:string):Helper {
        const binReg = [
            new InstructionSet([`(?<code>${code})(?<w>0)`, `(?<val>[01]{8})`], {_: 'ta'}),
            new InstructionSet([`(?<code>${code})(?<w>1)`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'ta'}),
        ];
        const asmReg = [
            new InstructionSet([`(?<code>${name})\\s+AL\\s*,\\s*(?<val>[0-9A-F]{2})`], {'w': '0', _:'ta'}),
            new InstructionSet([`(?<code>${name})\\s+AX\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`], {'w': '1', _:'ta'}),
        ];
        return {
            asmReg, binReg,
            asm(config: InstructionConfig): string {
                return `${name} ${(config.w.bin == '1') ? 'AX' : 'AL'}, ${config.val.asm}`;
            },
            bin(config: InstructionConfig): string[] {
                let bins = [
                    `${code}${config.w.bin}`,
                    `${config.val.bin?.substring(0, 8)}`];
                if (config.w.bin == '1') {
                    bins.push(`${config.val.bin?.substring(8)}`);
                }

                return bins;
            }
        };
    }

}

export class AAASet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        const al = cpu.AL;
        const af = cpu.AF;
        if ((al & 0x0F) > 9 || af) {
            cpu.AL = al + 6;
            cpu.AH = cpu.AH + 1;
            cpu.AF = cpu.CF = 1;
        } else {
            cpu.AF = cpu.CF = 0;
        }
        cpu.AL = cpu.AL & 0x0F;
        if (HelperSet._asDOSBOX)
            HelperSet.UpdateFlags(cpu.AL, 8, cpu, new Set([FLAGS.P, FLAGS.Z, FLAGS.S]))
        cpu.IP += 1;
    }

    private static Bin: string = '00110111';
    private static Asm: string = 'AAA';

    constructor() {
        super(
            [new InstructionSet([AAASet.Bin])],
            [new InstructionSet([AAASet.Asm])],
            {},
            AAASet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [AAASet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return AAASet.Asm;
    }
}
export class AADSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.AL = cpu.AH * 10 + cpu.AL;
        cpu.AH = 0;
        if (HelperSet._asDOSBOX)
            cpu.CF = cpu.OF = cpu.AF = 0;
        HelperSet.UpdateFlags<CPU>(cpu.AL, 8, cpu, new Set<FLAGS>([FLAGS.Z, FLAGS.S, FLAGS.P]));
        cpu.IP += 2;
    }

    private static Bin: string = '11010101';
    private static Bin2: string = '00001010';
    private static Asm: string = 'AAD';

    constructor() {
        super(
            [new InstructionSet([AADSet.Bin, AADSet.Bin2])],
            [new InstructionSet([AADSet.Asm])],
            {},
            AADSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [AADSet.Bin, AADSet.Bin2]
    }

    protected asm(config: InstructionConfig): string {
        return AADSet.Asm;
    }
}
export class AAMSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        const quotient = Math.floor(cpu.AL / 10);
        const remainder = cpu.AL % 10;
        cpu.AH = quotient;
        cpu.AL = remainder;
        if (HelperSet._asDOSBOX)
            cpu.CF = cpu.OF = cpu.AF = 0;
        HelperSet.UpdateFlags(cpu.AL, 8, cpu, new Set<FLAGS>([FLAGS.P, FLAGS.Z, FLAGS.S]));
        cpu.IP += 2;
    }

    private static Bin: string = '11010100';
    private static Bin2: string = '00001010';
    private static Asm: string = 'AAM';

    constructor() {
        super(
            [new InstructionSet([AAMSet.Bin, AAMSet.Bin2])],
            [new InstructionSet([AAMSet.Asm])],
            {},
            AAMSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [AAMSet.Bin, AAMSet.Bin2]
    }

    protected asm(config: InstructionConfig): string {
        return AAMSet.Asm;
    }
}
export class AASSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if (HelperSet._asDOSBOX) {
            if ((cpu.AL & 0x0f) > 9) {
                cpu.SF = cpu.AL > 0x85 ? 1 : 0;
                cpu.AX -= 0x106;
                cpu.OF = 0;
                cpu.CF = cpu.AF = 1;
            } else if (cpu.AF == 1) {
                cpu.OF = ((cpu.AL >= 0x80) && (cpu.AL <= 0x85)) ? 1 : 0;
                cpu.SF = (cpu.AL < 0x06) || (cpu.AL > 0x85) ? 1 : 0;
                cpu.AX -= 0x106;
                cpu.CF = cpu.AF = 1;
            } else {
                cpu.SF = (cpu.AL >= 0x80) ? 1 : 0;
                cpu.OF = cpu.CF = cpu.AF = 0;
            }
            cpu.ZF = cpu.AL == 0 ? 1 : 0;
            cpu.PF = HelperSet.calculateParityFlag(cpu.AL) ? 1 : 0;
        } else {
            if ((cpu.AL & 0xF) > 9 || cpu.AF == 1) { // Check AF or lower nibble > 9
                cpu.AL -= 6;
                cpu.AH -= 1;
                cpu.AF = cpu.CF = 1;

            } else
                cpu.AF = cpu.CF = 0;
            cpu.AL &= 0xF; // Clear upper nibble
        }
        cpu.IP += 1;
    }

    private static Bin: string = '00111111';
    private static Asm: string = 'AAS';

    constructor() {
        super(
            [new InstructionSet([AASSet.Bin])],
            [new InstructionSet([AASSet.Asm])],
            {},
            AASSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [AASSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return AASSet.Asm;
    }
}
export class ADCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w  = config.w?.bin == '1'? 16 : 8;
        let p0:GetterAndSetter;
        let p1:GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            }
            else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ADCSet.Tr.bin(config).length;
        }
        else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ADCSet.Tc.bin(config).length;
        }
        else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ADCSet.Ta.bin(config).length;
        }
        else {
           p1 = p0 = {
                name: 'HZ',
                get value(){return 0},
                set value(value){}
            }
        }

        const result = p0.value + p1.value + cpu.CF;
        HelperSet.UpdateFlags(result,  w, cpu, new Set<FLAGS>([
            FLAGS.C, FLAGS.P, FLAGS.O, FLAGS.S, FLAGS.Z]));
        cpu.OF = ((p0.value ^ p1.value ^ 0x80) & (result ^ p1.value)) & 0x80;
        cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(p0.value, p1.value,
            w, cpu.CF);
        p0.value = result;


    }
    private static Asm: string = 'ADC';
    protected static Tr = HelperSet.TR(this.Asm, '000100');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '010');
    protected static Ta = HelperSet.TA(this.Asm, '0001010' )
    // private static IOMRbin = '100000';
    // private static IOMREGbin = '010';
    //private static IAbin = '0001010';



    constructor() {
        super([...ADCSet.Ta.binReg, ...ADCSet.Tc.binReg, ...ADCSet.Tr.binReg],
            [...ADCSet.Ta.asmReg, ...ADCSet.Tc.asmReg, ...ADCSet.Tr.asmReg],
            {}, ADCSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'tr':
                return ADCSet.Tr.asm(config);
            case 'tc':
                return ADCSet.Tc.asm(config);
            case 'ta':
                return ADCSet.Ta.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'tr':
                return ADCSet.Tr.bin(config);
            case 'tc':
                return ADCSet.Tc.bin(config);
            case 'ta':
                return ADCSet.Ta.bin(config);
        }
        return super.bin(config);
    }
}
export class ADDSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w  = config.w?.bin == '1'? 16 : 8;
        let p0:GetterAndSetter;
        let p1:GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            }
            else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ADDSet.Tr.bin(config).length;
        }
        else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ADDSet.Tc.bin(config).length;
        }
        else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ADDSet.Ta.bin(config).length;
        }
        else {
            p1 = p0 = {
                name: 'HZ',
                get value(){return 0},
                set value(value){}
            }
        }

        const result = p0.value + p1.value;
        cpu.OF = ((p0.value ^ p1.value ^ 0x80) & (result ^ p1.value)) & 0x80;
        cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(p0.value, p1.value, w);
        HelperSet.UpdateFlags(result,  w, cpu, new Set<FLAGS>([
            FLAGS.C, FLAGS.P, FLAGS.O, FLAGS.S, FLAGS.Z]));

        p0.value = result;

    }
    private static Asm: string = 'ADD';
    protected static Tr = HelperSet.TR(this.Asm, '000000');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '000');
    protected static Ta = HelperSet.TA(this.Asm, '0000010' )



    constructor() {
        super([...ADDSet.Ta.binReg, ...ADDSet.Tc.binReg, ...ADDSet.Tr.binReg],
            [...ADDSet.Ta.asmReg, ...ADDSet.Tc.asmReg, ...ADDSet.Tr.asmReg],
            {}, ADDSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'tr':
                return ADDSet.Tr.asm(config);
            case 'tc':
                return ADDSet.Tc.asm(config);
            case 'ta':
                return ADDSet.Ta.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'tr':
                return ADDSet.Tr.bin(config);
            case 'tc':
                return ADDSet.Tc.bin(config);
            case 'ta':
                return ADDSet.Ta.bin(config);
        }
        return super.bin(config);
    }
}
export class ANDSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w  = config.w?.bin == '1'? 16 : 8;
        let p0:GetterAndSetter;
        let p1:GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            }
            else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ANDSet.Tr.bin(config).length;
        }
        else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ANDSet.Tc.bin(config).length;
        }
        else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = {
                name: "CONST "+ config.val.asm,
                get value(){
                    return parseInt(config.val.asm!, 16);
                }
            }
            cpu.IP += ANDSet.Ta.bin(config).length;
        }
        else {
            p1 = p0 = {
                name: 'HZ',
                get value(){return 0},
                set value(value){}
            }
        }

        const result = p0.value & p1.value;
       // cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(p0.value, p1.value, w);
        cpu.CF = cpu.OF = 0;
        if(HelperSet._asDOSBOX) cpu.AF = 0;
        HelperSet.UpdateFlags(result,  w, cpu, new Set<FLAGS>([
             FLAGS.P, FLAGS.S, FLAGS.Z]));

        p0.value = result;

    }
    private static Asm: string = 'AND';

    protected static Tr = HelperSet.TR(this.Asm, '001000');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '100');
    protected static Ta = HelperSet.TA(this.Asm, '0010010' )



    constructor() {
        super([...ANDSet.Ta.binReg, ...ANDSet.Tc.binReg, ...ANDSet.Tr.binReg],
            [...ANDSet.Ta.asmReg, ...ANDSet.Tc.asmReg, ...ANDSet.Tr.asmReg],
            {}, ANDSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'tr':
                return ANDSet.Tr.asm(config);
            case 'tc':
                return ANDSet.Tc.asm(config);
            case 'ta':
                return ANDSet.Ta.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'tr':
                return ANDSet.Tr.bin(config);
            case 'tc':
                return ANDSet.Tc.bin(config);
            case 'ta':
                return ANDSet.Ta.bin(config);
        }
        return super.bin(config);
    }
}
export class CALLSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config:InstructionConfig = this;
        let n:number = 0;
        let size  = 1;
        switch (config.i.bin) {
            case '0': //NEAR
                n = parseInt(config['disp'].asm!, 16);
                n += cpu.IP + 3;
                HelperSet.push(cpu, cpu.IP+3);
                n = n & 0xFFFF;
                cpu.IP = n;
                break;
            case '1':
                HelperSet.push(cpu, cpu.IP+3);
                n = parseInt(config['disp'].asm!, 16);
                cpu.IP = n;
                break;
            case '2':
                config.w = {bin:'1', asm:'WORD'};
                let rm = HelperSet.rm(cpu, config);
                size = 2;
                if(config.ea) size += 2;
                if(config.disp)
                    if(config.disp.bin!.length > 8) size += 2;
                    else size += 1;
                HelperSet.push(cpu, cpu.IP+size);
                cpu.IP = rm.value;
                break;
            case '3':
                HelperSet.push(cpu, cpu.CS);
                HelperSet.push(cpu, cpu.IP+5);
                cpu.CS = parseInt(config.disp.asm!, 16);
                cpu.IP = parseInt(config.ea.asm!, 16);
                break;
            case '4':
                HelperSet.push(cpu, cpu.CS);
                config.w = {bin:'1', asm:'WORD'};
                let rmf = HelperSet.rm(cpu, config);
                size = 2;
                if(config.ea) size += 2;
                if(config.disp)
                    if(config.disp.bin!.length > 8) size += 2;
                    else size += 1;
                HelperSet.push(cpu, cpu.IP+size);
                console.log(rmf, rmf.value, rmf.next?.value.toString(16))
                if(rmf.next) {
                    cpu.CS =  rmf.next?.value;
                    cpu.IP =  rmf.value;
                }
                else {
                    if(HelperSet._asDOSBOX) {
                        cpu.CS = 0xF000;
                        cpu.IP = 0x1060;
                    }
                    else throw new Error("Not such instruction!");
                }
                break;
        }

    }

    private _cpu: CPU;

    constructor(cpu: CPU) {
        super([
            new InstructionSet(['(?<code>11101000)', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {'i': '0', 'mod': '0'}),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)010(?<rm>000|001|010|011|100|101|111)'], {
                'i': '2',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)010(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '2',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>01)010(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'i': '2',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>10)010(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '2',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)010(?<rm>[01]{3})'], {'i': '2', 'reg': '010'}),
            new InstructionSet(['(?<code>10011010)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '3',
                'mod': '0'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)011(?<rm>000|001|010|011|100|101|111)'], {
                'i': '4',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)011(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '4',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>01)011(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'i': '4',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>10)011(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '4',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)011(?<rm>[01]{3})'], {'i': '4', 'reg': '011'}),

        ], [
            new InstructionSet([`(?<code>CALL)\\s+(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})`], {'i': '1', 'mod': '0'}),
            new InstructionSet([`(?<code>CALL)\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '2',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>CALL)\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '2',
                'rm': '110',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>CALL)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '2',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>CALL)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '2',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>CALL)\\s+(?<rm>${Reg16_Key.join('|')})`], {'i': '2', 'w': '1', 'mod': '11'}),
            new InstructionSet([`(?<code>CALL)\\s(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*:\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})`], {
                'i': '3',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>CALL)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '4',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>CALL)\\s+FAR\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'rm': '110',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>CALL)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>CALL)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>CALL)\\s+FAR\\s+(?<rm>${Reg16_Key.join('|')})`], {
                'i': '4',
                'w': '1',
                'mod': '11'
            }),
        ], {}, CALLSet.Run);
        this._cpu = cpu;
    }

    protected asm(config: InstructionConfig): string {
        switch (config.i.bin) {
            case '0':
                let n = parseInt(config['disp'].asm!, 16);
                n += this._cpu.IP + 3;
                n = n & 0xFFFF;
                return `CALL ${n.toString(16).padStart(4, '0')}`;
            case '1':
                return `CALL ${config.disp.asm}`;
            case '2':
                if (config.mod.bin == '11')
                    return `CALL ${config.rm.asm}`
                return `CALL [${config.ea ? config.ea.asm : config.rm.asm}${config.mod.bin == '10' ? '+' : ''}${config.disp ? config.disp.asm : ''}]`;
            case '3':
                return `CALL ${config.disp.asm}:${config.ea.asm}`;
            case '4':
                if (config.mod.bin == '11')
                    return `CALL FAR ${config.rm.asm}`
                return `CALL FAR [${config.ea ? config.ea.asm : config.rm.asm}${config.mod.bin == '10' ? '+' : ''}${config.disp ? config.disp.asm : ''}]`;

        }
        return 'TODO';
        //  return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config.i.bin) {
            case '0':
                return ['11101000', `${config.disp.bin?.substring(0, 8)}`, `${config.disp.bin?.substring(8)}`]
            case '1':
                let n = parseInt(config['disp'].asm!, 16);
                n -= this._cpu.IP + 3;
                n = n & 0xFFFF;
                let bin = n.toString(2).padStart(16, '0');
                return ['11101000', bin.substring(8), bin.substring(0, 8)]
            case '2':
                let b = [`11111111`, `${config.mod.bin}010${config.rm.bin}`];
                if (config.ea) {
                    b.push(config.ea.bin!.substring(0, 8));
                    b.push(config.ea.bin!.substring(8));
                }
                if (config.disp) {
                    if (config.disp.bin?.length == 8)
                        b.push(config.disp.bin!);
                    else {
                        b.push(config.disp.bin!.substring(0, 8));
                        b.push(config.disp.bin!.substring(8));
                    }
                }
                return b;
            case '3':
                return ['10011010',
                    `${config.ea.bin?.substring(0, 8)}`,
                    `${config.ea.bin?.substring(8)}`,
                    `${config.disp.bin?.substring(0, 8)}`,
                    `${config.disp.bin?.substring(8)}`,
                ];
            case '4':
                b = [`11111111`, `${config.mod.bin}011${config.rm.bin}`];
                if (config.ea) {
                    b.push(config.ea.bin!.substring(0, 8));
                    b.push(config.ea.bin!.substring(8));
                }
                if (config.disp) {
                    if (config.disp.bin?.length == 8)
                        b.push(config.disp.bin!);
                    else {
                        b.push(config.disp.bin!.substring(0, 8));
                        b.push(config.disp.bin!.substring(8));
                    }
                }
                return b;

        }
        return ['TODO'];
    }
}
export class CBWSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if (cpu.AL & 0x80) { // Check MSB of AL
            cpu.AH = 0xFF; // Sign-extend AL to AH
        } else {
            cpu.AH = 0x00; // Clear AH
        }
        cpu.IP += 1;
    }

    private static Bin: string = '10011000';
    private static Asm: string = 'CBW';

    constructor() {
        super(
            [new InstructionSet([CBWSet.Bin])],
            [new InstructionSet([CBWSet.Asm])],
            {},
            CBWSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CBWSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CBWSet.Asm;
    }
}
export class CLCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.CF = 0;
        cpu.IP += 1;
    }

    private static Bin: string = '11111000';
    private static Asm: string = 'CLC';

    constructor() {
        super(
            [new InstructionSet([CLCSet.Bin])],
            [new InstructionSet([CLCSet.Asm])],
            {},
            CLCSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CLCSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CLCSet.Asm;
    }
}
export class CLDSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.DF = 0;
        cpu.IP += 1;
    }

    private static Bin: string = '11111100';
    private static Asm: string = 'CLD';

    constructor() {
        super(
            [new InstructionSet([CLDSet.Bin])],
            [new InstructionSet([CLDSet.Asm])],
            {},
            CLDSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CLDSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CLDSet.Asm;
    }
}
export class CLISet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.IF = 0;
        cpu.IP += 1;
    }

    private static Bin: string = '11111010';
    private static Asm: string = 'CLI';

    constructor() {
        super(
            [new InstructionSet([CLISet.Bin])],
            [new InstructionSet([CLISet.Asm])],
            {},
            CLISet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CLISet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CLISet.Asm;
    }
}
export class CMCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.CF = cpu.CF ? 0 : 1;
        cpu.IP += 1;
    }

    private static Bin: string = '11110101';
    private static Asm: string = 'CMC';

    constructor() {
        super(
            [new InstructionSet([CMCSet.Bin])],
            [new InstructionSet([CMCSet.Asm])],
            {},
            CMCSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CMCSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CMCSet.Asm;
    }
}


//CODE w, mod REG rm => CODE w RM
export class IRMOSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, reg: string, excute: any) {
        super([
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>00)(?<reg>${reg})(?<rm>000|001|010|011|100|101|111)`], {'d': '0'}),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>00)(?<reg>${reg})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>01)(?<reg>${reg})(?<rm>[01]{3})`, `(?<disp>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>10)(?<reg>${reg})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>11)(?<reg>${reg})(?<rm>[01]{3})`]),

            ], [
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "reg": reg}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "reg": reg, "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "reg": reg}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "reg": reg}),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})`], {
                    "mod": "11",
                    "w": "0",
                    "reg": reg
                }),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})`], {
                    "mod": "11",
                    "w": "1",
                    "reg": reg
                })

            ],
            {name: {asm: name, bin: code}}, excute
        );
    }

    protected asm(config: InstructionConfig): string {
        let disp = config.disp?.asm ?? "";
        if (disp.length == 4) {
            disp = '+' + disp;
        }
        let p = `${config.w.asm} PTR [${config.rm.asm}${disp}]`;
        if (config.mod.bin == '00' && config.rm.bin == '110') {
            p = `${config.w.asm} PTR [${config.ea.asm}]`
        }
        if (config.mod.bin == '11') {
            p = config.rm.asm!
        }
        return config.name.asm + ` ${p}`

    }

    protected bin(config: InstructionConfig): string[] {
        let list = [config.name.bin! + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
        if (config.mod.bin == "00" && config.rm.bin == "110") {
            list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
        } else if (config.mod.bin == "01") {
            list.push(config.disp.bin!);
        } else if (config.mod.bin == "10") {
            list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
        }
        return list;
    }
}

//CODE reg => CODE reg
export class RSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, w: boolean, excute: any) {
        super([
                new InstructionSet([`(?<code>${code})(?<reg>[01]{3})`], {w: w ? '1' : '0'})
            ], [
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${w ? Reg16_Key.join('|') : Reg8_Key.join('|')})`],
                    {w: w ? '1' : '0'}),
            ],
            {name: {asm: name, bin: code}}, excute
        );
    }

    protected asm(config: InstructionConfig): string {
        return config.name.asm + ` ${config.reg.asm}`
    }

    protected bin(config: InstructionConfig): string[] {
        return [config.name.bin! + config.reg.bin!];
    }
}

//CODE d w, mod reg rm => CODE RM, REG; CODE REG, RM
export class RMMSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, excute: any) {
        super([
                new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>000|001|010|011|100|101|111)`]),
                new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>01)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>10)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`]),
                new InstructionSet([`(?<code>${code})(?<d>[01])(?<w>[01])`, `(?<mod>11)(?<reg>[01]{3})(?<rm>[01]{3})`]),
            ], [
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "d": "1", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "0", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "1", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "d": "1", "w": "0", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "d": "1", "w": "1", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "01", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "01", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "d": "1", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "10", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "10", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "d": "1", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*(?<rm>${Reg8_Key.join('|')})`],
                    {"mod": "11", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                    {"mod": "11", "d": "1", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "11", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "11", "d": "0", "w": "1"}),
            ],
            {name: {asm: name, bin: code}}, excute
        );
    }

    protected asm(config: InstructionConfig): string {
        let p1 = config.reg.asm!;
        let disp = config.disp?.asm ?? "";
        if (disp.length == 4) {
            disp = '+' + disp;
        }
        let p2 = `[${config.rm.asm}${disp}]`;
        if (config.mod.bin == '00' && config.rm.bin == '110') {
            p2 = `[${config.ea.asm}]`
        }
        if (config.mod.bin == '11') {
            p2 = config.rm.asm!
        }
        if (config.d.bin == '0')
            return config.name.asm + ` ${p2}, ${p1}`
        else
            return config.name.asm + ` ${p1}, ${p2}`
    }

    protected bin(config: InstructionConfig): string[] {
        let list = [config.name.bin! + config.d.bin! + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
        if (config.mod.bin == "00" && config.rm.bin == "110") {
            list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
        } else if (config.mod.bin == "01") {
            list.push(config.disp.bin!);
        } else if (config.mod.bin == "10") {
            list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
        }
        return list;
    }
}

//CODE s w, mod REG rm => CODE RM, val
export class IOMRSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, reg: string, excute: any) {
        super([
            //sw00 sw10
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>[01])(?<w>0)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`], {reg: reg}),
            //sw01
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>0)(?<w>1)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`,
                `(?<val2>[01]{8})`
            ], {reg: reg}),
            //sw11
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>000|001|010|011|100|101|111)`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>00)${reg}(?<rm>110)`,
                `(?<ea>[01]{8})`,
                `(?<ea2>[01]{8})`,
                `(?<val>[01]{8})`
            ], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>01)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>10)${reg}(?<rm>[01]{3})`,
                `(?<disp>[01]{8})`,
                `(?<disp2>[01]{8})`,
                `(?<val>[01]{8})`], {reg: reg}),
            new InstructionSet([
                `(?<code>${code})(?<s>1)(?<w>1)`,
                `(?<mod>11)${reg}(?<rm>[01]{3})`,
                `(?<val>[01]{8})`], {reg: reg}),
        ], [
            //sw00
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '11',
                w: '0'
            }),
            //sw01
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>\\s*[0-9A-F]{2})`,], {
                s: '0',
                reg: reg,
                mod: '11',
                w: '1'
            }),
            //sw10 sw11
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`], {
                s: '1',
                reg: reg,
                mod: '00'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<ea>\\s*[0-9A-F]{2})(?<ea2>\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`], {
                s: '1',
                reg: reg,
                mod: '00',
                rm: '110'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                mod: '01'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[+-]\\s*[0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                mod: '10'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[+-][0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                mod: '11',
                w: '0'
            }),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[+-][0-9A-F]{2})`,], {
                s: '1',
                reg: reg,
                mod: '11',
                w: '1'
            }),
        ], {
            'name': {
                asm: name,
                bin: code,
            },
            'reg': {
                asm: reg,
                bin: reg
            }
        }, excute)
    }

    protected asm(config: InstructionConfig): string {
        let addr = config.mod.bin == '00' && config.rm.bin == '110' ? config.ea.asm : config.rm.asm;
        if (config.mod.bin == '11') {
            return `${config.name.asm} ${config.rm.asm}, ${config.val.asm}`;
        }
        return `${config.name.asm} ${config.w.asm} PTR [${addr}${config.disp ? ((config.mod.bin == '10' ? '+' : '') + config.disp.asm) : ''}], ${config.val.asm}`;
    }

    protected bin(config: InstructionConfig): string[] {
        let bins = [
            `${config.name.bin}${config.s.bin}${config.w.bin}`,
            `${config.mod.bin}${config.reg.bin}${config.rm.bin}`];
        if (config.mod.bin == '00' && config.rm.bin == '110') {
            bins.push(`${config.ea.bin?.substring(0, 8)}`);
            bins.push(`${config.ea.bin?.substring(8)}`);
        }
        if (config.mod.bin == '01') {
            bins.push(`${config.disp.bin}`);
        }
        if (config.mod.bin == '10') {
            bins.push(`${config.disp.bin?.substring(0, 8)}`);
            bins.push(`${config.disp.bin?.substring(8)}`);
        }
        if (config.s.bin == '0' && config.w.bin == '1') {
            bins.push(`${config.val.bin?.substring(0, 8)}`);
            bins.push(`${config.val.bin?.substring(8)}`);
        } else {
            bins.push(`${config.val.bin}`);
        }
        return bins;
    }
}

//CODE w, val => CODE AX|AL, val
export class JSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private _cpu: CPU;

    constructor(name: string, name2: string, bin: string, e: any, cpu: CPU) {
        super([
            new InstructionSet([`(?<code>)${bin}`, `(?<disp>[01]{8})`], {i: '0', 'mod': '00'})
        ], name == name2 ? [
            new InstructionSet([`(?<code>${name})\\s+(?<disp>[0-9A-F]{2})`], {i: '1', mod: '00'}),
        ] : [
            new InstructionSet([`(?<code>${name})\\s+(?<disp>[0-9A-F]{2})`], {i: '1', mod: '00'}),
            new InstructionSet([`(?<code>${name2})\\s+(?<disp>[0-9A-F]{2})`], {i: '1', mod: '00'}),
        ], {
            name: {bin: bin, asm: name},
            name2: {bin: bin, asm: name2},
        }, e);
        this._cpu = cpu;
    }

    protected bin(config: InstructionConfig): string[] {
        if (config.i.bin == '0')
            return [`${config.name.bin}`, `${config.disp.bin}`];
        else if (config.i.bin == '1') {
            let disp = (parseInt(config.disp.bin!, 2) - (this._cpu.IP + 2)) & 0xFF;
            return [`${config.name.bin}`, `${disp.toString(2).padStart(8, '0')}`];
        }
        return super.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        if (config.i.bin == '0') {
            let disp = (parseInt(config.disp.bin!, 2) + (this._cpu.IP + 2)) & 0xFF;
            return `${config.name.asm} ${disp.toString(16).padStart(2, '0')}`;
        } else if (config.i.bin == '1')
            return `${config.name.asm} ${config.disp.asm}`;
        return super.asm(config);
    }
}

export class IASet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, excute: any) {
        super([
            new InstructionSet([`(?<code>${code})(?<w>0)`, `(?<val>[01]{8})`]),
            new InstructionSet([`(?<code>${code})(?<w>1)`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`]),
        ], [
            new InstructionSet([`(?<code>${name})\\s+AL\\s*,\\s*(?<val>[0-9A-F]{2})`], {'w': '0'}),
            new InstructionSet([`(?<code>${name})\\s+AX\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`], {'w': '1'}),

        ], {
            'name': {
                asm: name,
                bin: code,
            }
        }, excute);
    }

    protected asm(config: InstructionConfig): string {
        return `${config.name.asm} ${(config.w.bin == '1') ? 'AX' : 'AL'}, ${config.val.asm}`;
    }

    protected bin(config: InstructionConfig): string[] {
        let bins = [
            `${config.name.bin}${config.w.bin}`,
            `${config.val.bin?.substring(0, 8)}`];
        if (config.w.bin == '1') {
            bins.push(`${config.val.bin?.substring(8)}`);
        }

        return bins;
    }
}


export class JMPSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private _cpu: CPU;

    constructor(e: any, cpu: CPU) {
        super([
            new InstructionSet(['(?<code>11101001)', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {'i': '0', 'mod': '0'}),
            new InstructionSet(['(?<code>11101011)', '(?<disp>[01]{8})'], {'i': '2', 'mod': '01'}),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)100(?<rm>000|001|010|011|100|101|111)'], {
                'i': '4',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)100(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '4',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>01)100(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'i': '4',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>10)100(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '2',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)100(?<rm>[01]{3})'], {'i': '4', 'reg': '010'}),
            new InstructionSet(['(?<code>11101010)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '5',
                'mod': '0'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)101(?<rm>000|001|010|011|100|101|111)'], {
                'i': '6',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)101(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '6',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>01)101(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'i': '6',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>10)101(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '6',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)101(?<rm>[01]{3})'], {'i': '6', 'reg': '011'}),

        ], [
            new InstructionSet([`(?<code>JMP)\\s+(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})`], {'i': '1', 'mod': '0'}),
            new InstructionSet([`(?<code>JMP)\\s+(?<disp>[\\+\\-][0-9A-F]{2})`], {'i': '3', 'mod': '01'}),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '4',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'rm': '110',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+(?<rm>${Reg16_Key.join('|')})`], {'i': '4', 'w': '1', 'mod': '11'}),
            new InstructionSet([`(?<code>JMP)\\s(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*:\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})`], {
                'i': '5',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '6',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'rm': '110',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+(?<rm>${Reg16_Key.join('|')})`], {
                'i': '6',
                'w': '1',
                'mod': '11'
            }),
        ], {}, e);
        this._cpu = cpu;
    }

    protected asm(config: InstructionConfig): string {
        switch (config.i.bin) {
            case '0':
                let n = parseInt(config['disp'].asm!, 16);
                n += this._cpu.IP + 3;
                n = n & 0xFFFF;
                return `JMP ${n.toString(16).padStart(4, '0')}`;
            case '1':
                return `JMP ${config.disp.asm}`;
            case '2':
                let sn = parseInt(config['disp'].asm!, 16) & 0xFF;
                sn = (sn + (this._cpu.IP + 2)) & 0xFF;
                return `JMP ${this.changeSigned(sn.toString(2)).asm}`;
            case '3':
                return `JMP ${config.disp.asm}`;
            case '4':
                if (config.mod.bin == '11')
                    return `JMP ${config.rm.asm}`
                return `JMP [${config.ea ? config.ea.asm : config.rm.asm}${config.mod.bin == '10' ? '+' : ''}${config.disp ? config.disp.asm : ''}]`;
            case '5':
                return `JMP ${config.disp.asm}:${config.ea.asm}`;
            case '6':
                if (config.mod.bin == '11')
                    return `JMP FAR ${config.rm.asm}`
                return `JMP FAR [${config.ea ? config.ea.asm : config.rm.asm}${config.mod.bin == '10' ? '+' : ''}${config.disp ? config.disp.asm : ''}]`;

        }
        return 'TODO';
        //  return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config.i.bin) {
            case '0':
                return ['11101001', `${config.disp.bin?.substring(0, 8)}`, `${config.disp.bin?.substring(8)}`]
            case '1':
                let n = parseInt(config['disp'].asm!, 16);
                n -= this._cpu.IP + 3;
                n = n & 0xFFFF;
                let bin = n.toString(2).padStart(16, '0');
                return ['11101001', bin.substring(8), bin.substring(0, 8)]
            case '2':
                return ['11101011', `${config.disp.bin}`]
            case '3':
                let sn = parseInt(config['disp'].asm!, 16);
                sn -= this._cpu.IP + 2;
                sn = sn & 0xFF;
                bin = sn.toString(2).padStart(16, '0');
                return ['11101011', bin.substring(8)]
            case '4':
                let b = [`11111111`, `${config.mod.bin}100${config.rm.bin}`];
                if (config.ea) {
                    b.push(config.ea.bin!.substring(0, 8));
                    b.push(config.ea.bin!.substring(8));
                }
                if (config.disp) {
                    if (config.disp.bin?.length == 8)
                        b.push(config.disp.bin!);
                    else {
                        b.push(config.disp.bin!.substring(0, 8));
                        b.push(config.disp.bin!.substring(8));
                    }
                }
                return b;
            case '5':
                return ['11101010',
                    `${config.ea.bin?.substring(0, 8)}`,
                    `${config.ea.bin?.substring(8)}`,
                    `${config.disp.bin?.substring(0, 8)}`,
                    `${config.disp.bin?.substring(8)}`,
                ];
            case '6':
                b = [`11111111`, `${config.mod.bin}101${config.rm.bin}`];
                if (config.ea) {
                    b.push(config.ea.bin!.substring(0, 8));
                    b.push(config.ea.bin!.substring(8));
                }
                if (config.disp) {
                    if (config.disp.bin?.length == 8)
                        b.push(config.disp.bin!);
                    else {
                        b.push(config.disp.bin!.substring(0, 8));
                        b.push(config.disp.bin!.substring(8));
                    }
                }
                return b;

        }
        return ['TODO'];
    }
}

export class ESCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(e: any) {
        super(
            [
                new InstructionSet([`(?<code>11011)(?<x>[01]{3})`, `(?<mod>00)(?<y>[01]{3})(?<rm>000|001|010|011|100|101|111)`]),
                new InstructionSet([`(?<code>11011)(?<x>[01]{3})`, `(?<mod>00)(?<y>[01]{3})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`]),
                new InstructionSet([`(?<code>11011)(?<x>[01]{3})`, `(?<mod>01)(?<y>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`]),
                new InstructionSet([`(?<code>11011)(?<x>[01]{3})`, `(?<mod>10)(?<y>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`]),
                new InstructionSet([`(?<code>11011)(?<x>[01]{3})`, `(?<mod>11)(?<y>[01]{3})(?<rm>[01]{3})`]),],
            [
                new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00"}),
                new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`],
                    {"mod": "00", "rm": "110"}),
                new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01"}),
                new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10"}),
                //   new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*(?<rm>${Reg8_Key.join('|')})`], {"mod": "11", "w":"0" }),
                new InstructionSet([`(?<code>ESC)\\s+(?<xy>[0-3][0-9A-F])\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                    {"mod": "11", "w": "1"})

            ],
            {name: {bin: '11011', asm: 'ESC'}}, e);
    }

    protected bin(config: InstructionConfig): string[] {
        if (config.xy) {
            let n = parseInt(config.xy.asm!, 16).toString(2).padStart(6, '0');
            let x = n.substring(0, 3);
            let y = n.substring(3);
            config.x = {bin: x, asm: x};
            config.y = {bin: y, asm: y};
        }
        let bin = [`${config.name.bin}${config.x.bin}`, `${config.mod.bin}${config.y.bin}${config.rm.bin}`];
        if (config.ea) {
            bin.push(config.ea.bin!.substring(0, 8));
            bin.push(config.ea.bin!.substring(8));
        }
        if (config.disp) {
            if (config.disp.bin?.length == 8)
                bin.push(config.disp.bin!);
            else {
                bin.push(config.disp.bin!.substring(0, 8));
                bin.push(config.disp.bin!.substring(8));
            }
        }
        return bin;
    }

    protected asm(config: InstructionConfig): string {
        if (config.x) {
            let n = parseInt(config.x.bin! + config.y.bin!, 2).toString(16).padStart(2, '0');
            config.xy = {bin: n, asm: n};
        }
        let addr = config.mod.bin == '00' && config.rm.bin == '110' ? config.ea.asm : config.rm.asm;
        if (config.mod.bin == '11') {
            return `ESC ${config.xy.asm}, ${config.rm.asm}`;
        }

        return `ESC ${config.xy.asm}, [${addr}${config.disp ? ((config.mod.bin == '10' ? '+' : '') + config.disp.asm) : ''}]`;
        ;
    }
}

export class IOSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private _fp: string;
    private _vp: string;
    private _name: string;

    constructor(name: string, fp: string, vp: string, e: any) {
        super([
            new InstructionSet([`(?<code>${fp})(?<w_reg>[01])`, `(?<port>[01]{8})`], {'i': '0'}),
            new InstructionSet([`(?<code>${vp})(?<w_reg>[01])`], {'i': '1'})
        ], [
            new InstructionSet([`(?<code>${name})\\s+(?<w_reg>AX|AL)\\s*,\\s*(?<port>[0-9A-F]{2})`], {'i': '0'}),
            new InstructionSet([`(?<code>${name})\\s+(?<w_reg>AX|AL)\\s*,\\s*DX`], {'i': '1'}),
        ], {}, e);
        this._fp = fp;
        this._vp = vp;
        this._name = name;
    }

    protected bin(config: InstructionConfig): string[] {
        if (config.i.bin == '0')
            return [`${this._fp}${config.w_reg.bin}`, `${config.port.bin}`]
        else if (config.i.bin == '1')
            return [`${this._vp}${config.w_reg.bin}`]
        return super.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        if (config.i.bin == '0')
            return `${this._name} ${config.w_reg.bin ? 'AX' : 'AL'}, ${config.port.asm}`;
        else if (config.i.bin == '1')
            return `${this._name} ${config.w_reg.bin ? 'AX' : 'AL'}, DX`;
        return super.asm(config);
    }
}

export class INTSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(e: any) {
        super([
            new InstructionSet([`11001100`], {port: '03'}),
            new InstructionSet([`11001101`, `(?<port>[01]{8})`]),
        ], [
            new InstructionSet([`INT\s+(?<port>[0-9A-F]{2})`]),
        ], {}, e);
    }

    protected bin(config: InstructionConfig): string[] {
        if (config.port.asm == '03')
            return [`11001100`];
        return [`11001101`, config.port.bin!];
    }

    protected asm(config: InstructionConfig): string {
        if (config.port.asm == '03')
            return `INT 03`;
        return `INT ${config.port.asm}`;
    }
}

// code mod,reg,rm || not mod == 11
function chooseLSet(d: boolean, w: boolean, list: InstructionSet[]): InstructionSet {
    if (d) {
        if (w) {
            return list[3];
        } else {
            return list[2];
        }
    } else {
        if (w) {
            return list[1];
        } else {
            return list[0];
        }
    }
}

export class LSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    constructor(name: string, code: string, d: boolean, w: boolean, e: any) {
        super([
            new InstructionSet([`(?<code>${code})`, '(?<mod>00)(?<reg>[01]{3})(?<rm>000|001|010|011|100|101|111)'], {
                'd': d ? '1' : '0',
                'w': w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, '(?<mod>00)(?<reg>[01]{3})(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'd': d ? '1' : '0',
                'w': w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, '(?<mod>01)(?<reg>[01]{3})(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'd': d ? '1' : '0',
                'w': w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, '(?<mod>10)(?<reg>[01]{3})(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'd': d ? '1' : '0',
                'w': w ? '1' : '0'
            }),
        ], [
            chooseLSet(d, w, [
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "d": "1", "w": "1"}),

            ]),
            chooseLSet(d, w, [
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "0", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "00", "d": "0", "w": "1", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "d": "1", "w": "0", "rm": "110"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "d": "1", "w": "1", "rm": "110"})
            ]),
            chooseLSet(d, w, [
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "01", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "01", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "d": "1", "w": "1"}),

            ]),
            chooseLSet(d, w, [
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                    {"mod": "10", "d": "0", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                    {"mod": "10", "d": "0", "w": "1"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "d": "1", "w": "0"}),
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "d": "1", "w": "1"}),
            ])
        ], {name: {bin: code, asm: name}}, e);
    }

    protected bin(config: InstructionConfig): string[] {
        let list = [config.name.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
        if (config.mod.bin == "00" && config.rm.bin == "110") {
            list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
        } else if (config.mod.bin == "01") {
            list.push(config.disp.bin!);
        } else if (config.mod.bin == "10") {
            list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
        }
        return list;
    }

    protected asm(config: InstructionConfig): string {
        let p1 = config.reg.asm!;
        let disp = config.disp?.asm ?? "";
        if (disp.length == 4) {
            disp = '+' + disp;
        }
        let p2 = `[${config.rm.asm}${disp}]`;
        if (config.mod.bin == '00' && config.rm.bin == '110') {
            p2 = `[${config.ea.asm}]`
        }
        if (config.mod.bin == '11') {
            p2 = config.rm.asm!
        }
        if (config.d.bin == '0')
            return config.name.asm + ` ${p2}, ${p1}`
        else
            return config.name.asm + ` ${p1}, ${p2}`
    }
}

export default class TCPU extends ACPU {
    private _regs: Memory = new Memory(0x20);
    private _mem: Memory = new Memory(0xFFFFF);

    get AX() {
        return this.get16(ALL.AX);
    }

    get BX() {
        return this.get16(ALL.BX);
    }

    get CX() {
        return this.get16(ALL.CX);
    }

    get DX() {
        return this.get16(ALL.DX);
    }

    get AH() {
        return this.get8(Reg8.AH);
    }

    get BH() {
        return this.get8(Reg8.BH);
    }

    get CH() {
        return this.get8(Reg8.CH);
    }

    get DH() {
        return this.get8(Reg8.DH);
    }

    get AL() {
        return this.get8(Reg8.AL);
    }

    get BL() {
        return this.get8(Reg8.BL);
    }

    get CL() {
        return this.get8(Reg8.CL);
    }

    get DL() {
        return this.get8(Reg8.DL);
    }

    get SI() {
        return this.get16(ALL.SI);
    }

    get DI() {
        return this.get16(ALL.DI);
    }

    get BP() {
        return this.get16(ALL.BP);
    }

    get SP() {
        return this.get16(ALL.SP);
    }

    get DS() {
        return this.get16(ALL.DS);
    }

    get ES() {
        return this.get16(ALL.ES);
    }

    get SS() {
        return this.get16(ALL.SS);
    }

    get CS() {
        return this.get16(ALL.CS);
    }

    get CF() {
        return this.getF(FLAGS.C) ? 1 : 0;
    }

    get ZF() {
        return this.getF(FLAGS.Z) ? 1 : 0;
    }

    get SF() {
        return this.getF(FLAGS.S) ? 1 : 0;
    }

    get OF() {
        return this.getF(FLAGS.O) ? 1 : 0;
    }

    get PF() {
        return this.getF(FLAGS.P) ? 1 : 0;
    }

    get AF() {
        return this.getF(FLAGS.A) ? 1 : 0;
    }

    get IF() {
        return this.getF(FLAGS.I) ? 1 : 0;
    }

    get DF() {
        return this.getF(FLAGS.D) ? 1 : 0;
    }

    get TF() {
        return this.getF(FLAGS.T) ? 1 : 0;
    }

    get IP() {
        return this.get16(ALL.IP);
    }

    set AX(n: number) {
        this.set16(ALL.AX, n);
    }

    set BX(n: number) {
        this.set16(ALL.BX, n);
    }

    set CX(n: number) {
        this.set16(ALL.CX, n);
    }

    set DX(n: number) {
        this.set16(ALL.DX, n);
    }

    set AH(n: number) {
        this.set8(Reg8.AH, n);
    }

    set BH(n: number) {
        this.set8(Reg8.BH, n);
    }

    set CH(n: number) {
        this.set8(Reg8.CH, n);
    }

    set DH(n: number) {
        this.set8(Reg8.DH, n);
    }

    set AL(n: number) {
        this.set8(Reg8.AL, n);
    }

    set BL(n: number) {
        this.set8(Reg8.BL, n);
    }

    set CL(n: number) {
        this.set8(Reg8.CL, n);
    }

    set DL(n: number) {
        this.set8(Reg8.DL, n);
    }

    set SI(n: number) {
        this.set16(ALL.SI, n);
    }

    set DI(n: number) {
        this.set16(ALL.DI, n);
    }

    set BP(n: number) {
        this.set16(ALL.BP, n);
    }

    set SP(n: number) {
        this.set16(ALL.SP, n);
    }

    set DS(n: number) {
        this.set16(ALL.DS, n);
    }

    set ES(n: number) {
        this.set16(ALL.ES, n);
    }

    set SS(n: number) {
        this.set16(ALL.SS, n);
    }

    set CS(n: number) {
        this.set16(ALL.CS, n);
    }

    set CF(n: number) {
        this.setF(FLAGS.C, n > 0);
    }

    set ZF(n: number) {
        this.setF(FLAGS.Z, n > 0);
    }

    set SF(n: number) {
        this.setF(FLAGS.S, n > 0);
    }

    set OF(n: number) {
        this.setF(FLAGS.O, n > 0);
    }

    set PF(n: number) {
        this.setF(FLAGS.P, n > 0);
    }

    set AF(n: number) {
        this.setF(FLAGS.A, n > 0);
    }

    set IF(n: number) {
        this.setF(FLAGS.I, n > 0);
    }

    set DF(n: number) {
        this.setF(FLAGS.D, n > 0);
    }

    set TF(n: number) {
        this.setF(FLAGS.T, n > 0);
    }

    set IP(n: number) {
        this.set16(ALL.IP, n);
    }

    private _calculateEffectiveAddress(segment: number, offset: number): number {
        return (segment << 4) + offset;
    }

    private fixOffset(offset: number): number {
        return offset & 0xFFFF;
    }

    get16(a: ALL) {
        let index = a * 2;
        return this._regs.get(index + 1) + (this._regs.get(index) << 8);
    }

    set16(a: ALL, n: number) {
        let index = a * 2;
        let v1 = n >> 8;
        this._regs.set(index + 1, n);
        this._regs.set(index, v1);
    }

    get8(a: Reg8) {
        let index = a > 3 ? (a - 4) * 2 : a * 2 + 1;
        return this._regs.get(index);
    }

    set8(a: Reg8, n: number) {
        let index = a > 3 ? (a - 4) * 2 : a * 2 + 1;
        this._regs.set(index, n);
    }

    getF(a: FLAGS) {
        let index = 0x1 << a;
        return (this.get16(ALL.FLAGS) & index) >= 1;
    }

    setF(a: FLAGS, b: boolean) {
        let index = 0x1 << a;
        let mask = ~index;


        if (b) {
            this.set16(ALL.FLAGS, this.get16(ALL.FLAGS) | index);
        } else {
            this.set16(ALL.FLAGS, this.get16(ALL.FLAGS) & mask);
        }
    }

    getMem8(offset?: number, segment?: number): number {
        offset = this.fixOffset(offset ?? 0);

        const ea = this._calculateEffectiveAddress(segment ?? this.DS, offset);
        return this._mem.get(ea);
    }

    setMem8(value: number, offset?: number, segment?: number) {
        offset = this.fixOffset(offset ?? 0)
        const ea = this._calculateEffectiveAddress(segment ?? this.DS, offset);
        this._mem.set(ea, value);
    }

    getMem16(offset?: number, segment?: number): number {
        offset = this.fixOffset(offset ?? 0)
        let mem = this.getMem8(this.fixOffset(offset + 1), segment) << 8;
        mem += this.getMem8(offset, segment);

        return mem;
    }

    setMem16(value: number, offset?: number, segment?: number) {
        offset = offset ?? 0;
        let x1 = value;
        let x2 = value >> 8;
        this.setMem8(x1, offset, segment);
        this.setMem8(x2, this.fixOffset(offset + 1), segment);
    }

    getCode(offset: number): number {
        return this._mem.get(this._calculateEffectiveAddress(this.CS, offset)) ?? 0;
    }
    showMem(seg:number,offset?:number):string{
        if(!offset) offset = 0;
        let tseg  = seg.toString(16).padStart(4, '0');
        let toffset  = offset.toString(16).padStart(4, '0');
        if(seg == this.DS) tseg = 'DS';
        if(seg == this.ES) tseg = 'ES';
        if(seg == this.SS) tseg = 'SS';
        if(seg == this.CS) tseg = 'CS';
        let str = `${tseg}:${toffset}\t`;
        for(let i = 0; i < 8; i++){
            str += `${this.getMem8(offset+i, seg).toString(16).padStart(2, '0')}\t`;
        }
        return str;
    }
    status() {
        let str =
            "┌─────┬─────┬─────┬─────┬────┬────┬────┬────┬────┬────┬────┬────┬─────────────────┬────┐\n";
        str += "│ AX  │ BX  │ CX  │ DX  │    │    │    │    │    │    │    │    │      FLAGS      │    │\n"
        str += "├──┬──┼──┬──┼──┬──┼──┬──┤ SI │ DI │ BP │ SP │ DS │ ES │ SS │ CS ├─┬─┬─┬─┬─┬─┬─┬─┬─┤ IP │\n"
        str += "│AH│AL│BH│BL│CH│CL│DH│DL│    │    │    │    │    │    │    │    │C│Z│S│O│P│A│I│D│T│    │\n"
        str += "├──┼──┼──┼──┼──┼──┼──┼──┼────┼────┼────┼────┼────┼────┼────┼────┼─┼─┼─┼─┼─┼─┼─┼─┼─┼────┤\n"
        str += "│" + this.AH.toString(16).padStart(2, '0') + "│" + this.AL.toString(16).padStart(2, '0') + ""
        str += "│" + this.BH.toString(16).padStart(2, '0') + "│" + this.BL.toString(16).padStart(2, '0') + ""
        str += "│" + this.CH.toString(16).padStart(2, '0') + "│" + this.CL.toString(16).padStart(2, '0') + ""
        str += "│" + this.DH.toString(16).padStart(2, '0') + "│" + this.DL.toString(16).padStart(2, '0') + ""
        str += "│" + this.SI.toString(16).padStart(4, '0') + ""
        str += "│" + this.DI.toString(16).padStart(4, '0') + ""
        str += "│" + this.BP.toString(16).padStart(4, '0') + ""
        str += "│" + this.SP.toString(16).padStart(4, '0') + ""
        str += "│" + this.DS.toString(16).padStart(4, '0') + ""
        str += "│" + this.ES.toString(16).padStart(4, '0') + ""
        str += "│" + this.SS.toString(16).padStart(4, '0') + ""
        str += "│" + this.CS.toString(16).padStart(4, '0') + ""
        str += "|" + (this.CF ? "1" : "0");
        str += "|" + (this.ZF ? "1" : "0");
        str += "|" + (this.SF ? "1" : "0");
        str += "|" + (this.OF ? "1" : "0");
        str += "|" + (this.PF ? "1" : "0");
        str += "|" + (this.AF ? "1" : "0");
        str += "|" + (this.IF ? "1" : "0");
        str += "|" + (this.DF ? "1" : "0");
        str += "|" + (this.TF ? "1" : "0");
        str += "│" + this.IP.toString(16).padStart(4, '0') + ""
        str += "│\n";
        str += "└──┴──┴──┴──┴──┴──┴──┴──┴────┴────┴────┴────┴────┴────┴────┴────┴─┴─┴─┴─┴─┴─┴─┴─┴─┴────┘\n"
        return str;
    }

    // getInstruction(add?:number):IInstruction<TCPU>|null {
    //     let offset = this._calculateEffectiveAddress(this.CS, this.IP);
    //     offset += add ?? 0;
    //     return null;
    // }
    constructor(name: string) {
        super(name);

    }


}