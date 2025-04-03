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
import exp from "node:constants";

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

enum FLAG_OPERATION {
    UNKNOWN, INC, DEC, MUL, ADD, ADC, SBB, SUB,
    CMP, SHL, DSHL, RCR, SHR, DSH, SAR, NEG,
    OR, AND, XOR, TEST, DIV
}

export type GetterAndSetter = {
    name: string
    get value(): number;
    set value(value: number);
    next?: GetterAndSetter;
}

type Helper = {
    asm: (config: InstructionConfig) => string,
    bin: (config: InstructionConfig) => string[],
    asmReg: InstructionSet[],
    binReg: InstructionSet[]
};

enum TypeFlag {
    t_UNKNOWN = 0,
    t_ADDb, t_ADDw,// t_ADDd,
    t_ORb, t_ORw,// t_ORd,
    t_ADCb, t_ADCw,// t_ADCd,
    t_SBBb, t_SBBw,// t_SBBd,
    t_ANDb, t_ANDw,// t_ANDd,
    t_SUBb, t_SUBw,// t_SUBd,
    t_XORb, t_XORw,// t_XORd,
    t_CMPb, t_CMPw,// t_CMPd,
    t_INCb, t_INCw,// t_INCd,
    t_DECb, t_DECw,// t_DECd,
    t_TESTb, t_TESTw, t_TESTd,
    t_SHLb, t_SHLw,// t_SHLd,
    t_SHRb, t_SHRw,// t_SHRd,
    t_SARb, t_SARw,// t_SARd,
    t_ROLb, t_ROLw,// t_ROLd,
    t_RORb, t_RORw,// t_RORd,
    t_RCLb, t_RCLw,// t_RCLd,
    t_RCRb, t_RCRw,// t_RCRd,
    t_NEGb, t_NEGw,// t_NEGd,

    t_DSHLw,// t_DSHLd,
    t_DSHRw,// t_DSHRd,
    t_MUL, t_DIV,
    t_NOTDONE,
    t_LASTFLAG
}

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

    static calculateParityFlag(result: number, w: number): boolean {
        let count = 0;
        if (!w) w = 8;
        for (let i = 0; i < w; i++) {
            if (result & (1 << i)) count++;
        }
        return (count % 2) === 0;
    }

    protected static calculateAuxiliaryCarryFlag(v1: number, v2: number, res: number) {
        const mask = 0x10; // Check bit 4 (carry out of bit 3)

        return ((v1 ^ v2) ^ res) & mask;
        //  return ((a & 0xF) + (b & 0xF) + (c ? c : 0)) & mask;
    }

    static UpdateFlags<CPU extends TCPU>(type: TypeFlag, cpu: CPU, option?: {
        var1?: number,
        var2?: number,
        res?: number;
        type?: TypeFlag,
        oldcf?: number
    }): void {
        const lf_var1 = option?.var1 || 0;
        const lf_var2 = option?.var2 || 0;
        const lf_res = option?.res || 0;
        const oldcf = option?.oldcf || 0;
        const oldcb = option?.oldcf !== 0 ? true : false;

        function FillFlags() {
            switch (type) {
                case TypeFlag.t_UNKNOWN:
                    break;
                case TypeFlag.t_ADDb:
                    cpu.CB = lf_res < lf_var1;
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OF = ((lf_var1 ^ lf_var2 ^ 0x80) & (lf_res ^ lf_var1)) & 0x80;
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_ADDw:
                    cpu.CB = lf_res < lf_var1;
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = (((lf_var1 ^ lf_var2 ^ 0x8000) & (lf_res ^ lf_var1)) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;
                case TypeFlag.t_ADCb:
                    cpu.CB = (lf_res < lf_var1) || (oldcb && (lf_res == lf_var1));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OF = (((lf_var1 ^ lf_var2 ^ 0x80) & (lf_res ^ lf_var1)) & 0x80);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_ADCw:
                    cpu.CB = (lf_res < lf_var1) || (oldcb && (lf_res == lf_var1));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = (((lf_var1 ^ lf_var2 ^ 0x8000) & (lf_res ^ lf_var1)) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;
                case TypeFlag.t_SBBb:
                    cpu.CB = ((lf_var1 < lf_res) || (oldcb && (lf_var2 == 0xff)));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OF = ((lf_var1 ^ lf_var2) & (lf_var1 ^ lf_res) & 0x80);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_SBBw:
                    cpu.CB = ((lf_var1 < lf_res) || (oldcb && (lf_var2 == 0xffff)));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = ((lf_var1 ^ lf_var2) & (lf_var1 ^ lf_res) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;

                case TypeFlag.t_SUBb:
                case TypeFlag.t_CMPb:
                    cpu.CB = ((lf_var1 < lf_var2));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OF = ((lf_var1 ^ lf_var2) & (lf_var1 ^ lf_res) & 0x80);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_SUBw:
                case TypeFlag.t_CMPw:
                    cpu.CB = ((lf_var1 < lf_var2));
                    cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(lf_var1, lf_var2, lf_res);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = ((lf_var1 ^ lf_var2) & (lf_var1 ^ lf_res) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;

                case TypeFlag.t_ORb:
                    cpu.CB = false;
                    cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = false;
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_ORw:
                    cpu.CB = false;
                    cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;


                case TypeFlag.t_TESTb:
                case TypeFlag.t_ANDb:
                    cpu.CB = false;
                    if (HelperSet._asDOSBOX)
                        cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = false;
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_TESTw:
                case TypeFlag.t_ANDw:
                    cpu.CB = false;
                    if (HelperSet._asDOSBOX)
                        cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = false;
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;

                case TypeFlag.t_XORb:
                    cpu.CB = false;
                    cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_XORw:
                    cpu.CB = false;
                    cpu.AB = false;
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;


                case TypeFlag.t_SHLb:
                    if (lf_var2 > 8) cpu.CB = false;
                    else cpu.CF = ((lf_var1 >> (8 - lf_var2)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_var1);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OF = ((lf_res >> 7) ^ cpu.CF); /* MSB of result XOR CF. WARNING: This only works because FLAGS_CF == 1 */
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;
                case TypeFlag.t_SHLw:
                    if (lf_var2 > 16) cpu.CB = false;
                    else cpu.CF = ((lf_var1 >> (16 - lf_var2)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_var1);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = ((lf_res >> 15) ^ cpu.CF); /* MSB of result XOR CF. WARNING: This only works because FLAGS_CF == 1 */
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;

                case TypeFlag.t_DSHLw:
                    cpu.CF = ((lf_var1 >> (32 - lf_var2)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = ((lf_res ^ lf_var1) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;


                case TypeFlag.t_SHRb:
                    cpu.CF = ((lf_var1 >> (lf_var2 - 1)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    if ((lf_var2 & 0x1f) == 1) cpu.OB = ((lf_var1 >= 0x80));
                    else cpu.OB = false;
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;
                case TypeFlag.t_SHRw:
                    cpu.CF = ((lf_var1 >> (lf_var2 - 1)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    if ((lf_var2 & 0x1f) == 1) cpu.OB = ((lf_var1 >= 0x8000));
                    else cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;


                case TypeFlag.t_DSHRw:	/* Hmm this is not correct for shift higher than 16 */
                    cpu.CF = ((lf_var1 >> (lf_var2 - 1)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OF = ((lf_res ^ lf_var1) & 0x8000);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;


                case TypeFlag.t_SARb:
                    cpu.CF = (((lf_var1) >> (lf_var2 - 1)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;
                case TypeFlag.t_SARw:
                    cpu.CF = (((lf_var1) >> (lf_var2 - 1)) & 1);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = (false);
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    cpu.AF = ((lf_var2 & 0x1f));
                    break;

                case TypeFlag.t_INCb:
                    cpu.AB = ((lf_res & 0x0f) == 0);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = ((lf_res == 0x80));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_INCw:
                    cpu.AB = ((lf_res & 0x0f) == 0);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_var1);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = ((lf_res == 0x8000));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;

                case TypeFlag.t_DECb:
                    cpu.AB = ((lf_res & 0x0f) == 0x0f);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = ((lf_res == 0x7f));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_DECw:
                    cpu.AB = ((lf_res & 0x0f) == 0x0f);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = ((lf_res == 0x7fff));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;
                case TypeFlag.t_NEGb:
                    cpu.CB = ((lf_var1 != 0));
                    cpu.AB = ((lf_res & 0x0f) != 0);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 8);
                    cpu.OB = ((lf_var1 == 0x80));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 8);
                    break;
                case TypeFlag.t_NEGw:
                    cpu.CB = ((lf_var1 != 0));
                    cpu.AB = ((lf_res & 0x0f) != 0);
                    cpu.ZB = HelperSet.calculateZeroFlag(lf_res);
                    cpu.SB = HelperSet.calculateSignFlag(lf_res, 16);
                    cpu.OB = ((lf_var1 == 0x8000));
                    cpu.PB = HelperSet.calculateParityFlag(lf_res, 16);
                    break;


                case TypeFlag.t_DIV:
                case TypeFlag.t_MUL:
                    break;

                default:
                    console.log("Unhandled flag type " + type);
                    return 0;
            }
            if (option) option.type = TypeFlag.t_UNKNOWN;
            return cpu.get16(ALL.FLAGS);
        }

        FillFlags();
    }

    protected raw(from: InstructionFrom | CPU, offset?: number): RawConfig | undefined {
        if (typeof from == "string") {
            let asm = this.asmReg;
            for (let i = 0; i < asm.length; i++) {
                if (asm[i].test([from]))
                    return asm[i].config([from]);
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
                bin: E[v.replace('+', '_').replace(/\s+/mg, '')].toString(2).padStart(pad ?? 3, '0'),
                arg: E[v.replace('+', '_').replace(/\s+/mg, '')],
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
        let n: number;
        if (isHex) {
            n = parseInt(v, 16);
            if (n < 0) {
                n = 0x100 + n;
            }
            n = n & 0xFF;
            return {
                bin: n.toString(2).padStart(8, '0'),
                asm: (n >= 0xC0 ? '-' + (0x100 - n).toString(16).padStart(2, '0').toUpperCase() : '+' + n.toString(16).padStart(2, '0')).toUpperCase(),
            }
        } else {
            n = parseInt(v, 2);
            return {
                bin: n.toString(2).padStart(8, '0'),
                asm: (n >= 0xC0 ? '-' + (0x100 - n).toString(16).padStart(2, '0').toUpperCase() : '+' + n.toString(16).padStart(2, '0')).toUpperCase(),
            }
        }
    }

    protected asm(config: InstructionConfig): string {
        throw new Error('Not implemented');
    }

    protected bin(config: InstructionConfig): string[] {
        throw new Error('Not implemented');
    }

    protected conf(raw: RawConfig, config: InstructionConfig): InstructionConfig | undefined {
        return config;
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
                        case 'AL':
                            config[k] = {asm: 'AL', bin: '0'};
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

        return this.conf(raw, config);
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
    protected static get_setCONST<CPU extends TCPU>(val:number){
        return  {
            name: "CONST 0x" + val.toString(16),
            get value() {
                return val;
            }
        }
    }
    protected static get_setReg<CPU extends TCPU>(cpu: CPU, w: boolean, reg: ALL | Reg8): GetterAndSetter {
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
                name: `[${seg ?? 'DS'}:${offset}|16]`,
                get value() {
                    return cpu.getMem16(offset, seg);
                },
                set value(value: number) {
                    cpu.setMem16(value, offset, seg);
                },
                next: {
                    name: `[${seg ?? 'DS'}:${offset + 2}|16]`,
                    get value() {
                        return cpu.getMem16(offset + 2, seg);
                    },
                    set value(value: number) {
                        cpu.setMem16(value, offset + 2, seg);
                    },
                }
            }
        else return {
            name: `[${seg ?? 'DS'}:${offset}|8]`,
            get value() {
                return cpu.getMem8(offset, seg);
            },
            set value(value: number) {
                cpu.setMem8(value, offset, seg);
            },
            next: {
                name: `[${seg ?? 'DS'}:${offset + 1}]|8`,
                get value() {
                    return cpu.getMem8(offset + 1, seg);
                },
                set value(value: number) {
                    cpu.setMem8(value, offset + 1, seg);
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

    static pop<CPU extends TCPU>(cpu: CPU): number {
        // if (cpu.SP >= this.stackStart) {
        //     throw new Error("Stack underflow");
        // }
        const value = cpu.getMem16(cpu.SP, cpu.SS);
        cpu.SP += 2;
        return value;
    }

    static push<CPU extends TCPU>(cpu: CPU, value: number) {
        // if (cpu.SP < this.stackEnd) {
        //     throw new Error("Stack overflow");
        // }
        cpu.SP -= 2;
        cpu.setMem16(value, cpu.SP, cpu.SS);
    }

    protected static FM(name: string, code: string, reg: string): Helper {
        return {
            asmReg: [
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                    {"mod": "00", "reg": reg, "_": "fm"}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                    {"mod": "00", "reg": reg, "rm": "110", "_": "fm"}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                    {"mod": "01", "reg": reg, "_": "fm"}),
                new InstructionSet([`(?<code>${name})\\s+(?<w>BYTE|WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                    {"mod": "10", "reg": reg, "_": "fm"}),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})`], {
                    "mod": "11",
                    "w": "0",
                    "reg": reg,
                    "_": "fm"
                }),
                new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})`], {
                    "mod": "11",
                    "w": "1",
                    "reg": reg,
                    "_": "fm"
                })
            ],
            binReg: [
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>00)(?<reg>${reg})(?<rm>000|001|010|011|100|101|111)`], {
                    'd': '0',
                    "_": "fm"
                }),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>00)(?<reg>${reg})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {"_": "fm"}),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>01)(?<reg>${reg})(?<rm>[01]{3})`, `(?<disp>[01]{8})`], {"_": "fm"}),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>10)(?<reg>${reg})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`], {"_": "fm"}),
                new InstructionSet([`(?<code>${code})(?<w>[01])`, `(?<mod>11)(?<reg>${reg})(?<rm>[01]{3})`], {"_": "fm"}),

            ],
            asm(config: InstructionConfig): string {
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
                return name + ` ${p}`

            },
            bin(config: InstructionConfig): string[] {
                let list = [code + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
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
    }

    protected static FR(name: string, code: string, w: boolean): Helper {
        return {
            asmReg: [
                new InstructionSet([`(?<code>${code})(?<reg>[01]{3})`], {w: w ? '1' : '0', _: 'fr'})
            ],
            binReg: [
                new InstructionSet([`(?<code>${name})\\s+(?<reg>${w ? Reg16_Key.join('|') : Reg8_Key.join('|')})`],
                    {w: w ? '1' : '0', _: 'fr'}),
            ],
            asm(config: InstructionConfig): string {
                return name + ` ${config.reg.asm}`
            },
            bin(config: InstructionConfig): string[] {
                return [code + config.reg.bin!];
            }
        }
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

    protected static TRDW(name: string, code: string, w?: boolean, d?: boolean): Helper {
        const binReg = [
            new InstructionSet([`(?<code>${code})`, `(?<mod>00)(?<reg>[01]{3})(?<rm>000|001|010|011|100|101|111)`], {
                _: 'tr',
                d: d ? '1' : '0',
                w: w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, `(?<mod>00)(?<reg>[01]{3})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {
                _: 'tr',
                d: d ? '1' : '0',
                w: w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, `(?<mod>01)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`], {
                _: 'tr',
                d: d ? '1' : '0',
                w: w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, `(?<mod>10)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`], {
                _: 'tr',
                d: d ? '1' : '0',
                w: w ? '1' : '0'
            }),
            new InstructionSet([`(?<code>${code})`, `(?<mod>11)(?<reg>[01]{3})(?<rm>[01]{3})`], {
                _: 'tr',
                d: d ? '1' : '0',
                w: w ? '1' : '0'
            }),
        ];
        const dw00 = [
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "0", _: "tr"}),
        ];
        const dw01 = [
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "1", _: "tr"})
        ];
        const dw10 = [
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*(?<rm>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "0", _: "tr"}),
        ];
        const dw11 = [
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>${name})\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "1", _: "tr"}),
        ];
        const asmReg = d ? (w ? dw11 : dw10) : (w ? dw01 : dw00);
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
                let list = [code, config.mod.bin! + config.reg.bin! + config.rm.bin!];
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


    protected static TA(name: string, code: string): Helper {
        const binReg = [
            new InstructionSet([`(?<code>${code})(?<w>0)`, `(?<val>[01]{8})`], {_: 'ta'}),
            new InstructionSet([`(?<code>${code})(?<w>1)`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'ta'}),
        ];
        const asmReg = [
            new InstructionSet([`(?<code>${name})\\s+AL\\s*,\\s*(?<val>[0-9A-F]{2})`], {'w': '0', _: 'ta'}),
            new InstructionSet([`(?<code>${name})\\s+AX\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`], {
                'w': '1',
                _: 'ta'
            }),
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
const HZ: GetterAndSetter = {
    name: 'HZ',
    get value() {
        return 0
    },
    set value(value) {
    }
};
let lflags: {
    var1?: number,
    var2?: number,
    res?: number;
    type?: TypeFlag,
    prev_type?: TypeFlag,
    oldcf?: number
} = {};

function EXCEPTION(...args: any) {
    console.error(args);
}

export class AAASet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        const al = cpu.AL;
        const af = cpu.AF;
        if (HelperSet._asDOSBOX) {
            cpu.SB = ((al >= 0x7a) && (al <= 0xf9));
        }
        if ((al & 0x0F) > 9) {
            if (HelperSet._asDOSBOX) {
                cpu.OB = (al & 0xf0) == 0x70;
            }
            cpu.AX += 0x106;
            cpu.AF = cpu.CF = 1;
            if (HelperSet._asDOSBOX) {
                cpu.ZB = al == 0;
            }
        } else if (cpu.AF) {
            cpu.AX += 0x106;
            if (HelperSet._asDOSBOX) {
                cpu.OB = false;
                cpu.ZB = false;
            }
            cpu.AF = cpu.CF = 1;
        } else {
            if (HelperSet._asDOSBOX) {
                cpu.OB = false;
                cpu.ZB = cpu.AL == 0;
            }
            cpu.AF = cpu.CF = 0;
        }
        cpu.AL = cpu.AL & 0x0F;
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
        cpu.SB = cpu.AL >= 0x80;
        cpu.ZB = cpu.AL == 0;
        cpu.PB = HelperSet.calculateParityFlag(cpu.AL, 8);
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
        cpu.SF = cpu.AL & 0x80;
        cpu.ZB = cpu.AL == 0;
        cpu.PB = HelperSet.calculateParityFlag(cpu.AL, 8);
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
                cpu.SB = cpu.AL > 0x85;
                cpu.AX -= 0x106;
                cpu.OF = 0;
                cpu.CF = cpu.AF = 1;
            } else if (cpu.AF == 1) {
                cpu.OB = ((cpu.AL >= 0x80) && (cpu.AL <= 0x85));
                cpu.SB = (cpu.AL < 0x06) || (cpu.AL > 0x85);
                cpu.AX -= 0x106;
                cpu.CF = cpu.AF = 1;
            } else {
                cpu.SB = (cpu.AL >= 0x80);
                cpu.OF = cpu.CF = cpu.AF = 0;
            }
            cpu.ZB = cpu.AL == 0;
            cpu.PB = HelperSet.calculateParityFlag(cpu.AL, 8);
        } else {
            if ((cpu.AL & 0xF) > 9 || cpu.AB) { // Check AF or lower nibble > 9
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
        let w = config.w?.bin == '1' ? 16 : 8;
        let p0: GetterAndSetter;
        let p1: GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            } else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ADCSet.Tr.bin(config).length;
        } else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ADCSet.Tc.bin(config).length;
        } else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ADCSet.Ta.bin(config).length;
        } else {
            p1 = p0 = HZ;
        }

        const result = p0.value + p1.value + cpu.CF;
        p0.value = result;
        lflags.var1 = p0.value;
        lflags.var2 = p1.value;
        lflags.res = result;
        lflags.oldcf = cpu.CF;
        lflags.type = w ? TypeFlag.t_ADCw : TypeFlag.t_ADCb;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);

    }

    private static Asm: string = 'ADC';
    protected static Tr = HelperSet.TR(this.Asm, '000100');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '010');
    protected static Ta = HelperSet.TA(this.Asm, '0001010')
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
        let w = config.w?.bin == '1' ? 16 : 8;
        let p0: GetterAndSetter;
        let p1: GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            } else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ADDSet.Tr.bin(config).length;
        } else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ADDSet.Tc.bin(config).length;
        } else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ADDSet.Ta.bin(config).length;
        } else {
            p1 = p0 = HZ;
        }

        const result = p0.value + p1.value;
        cpu.OF = ((p0.value ^ p1.value ^ 0x80) & (result ^ p1.value)) & 0x80;
        cpu.AF = HelperSet.calculateAuxiliaryCarryFlag(p0.value, p1.value, w);
        p0.value = result;

        lflags.var1 = p0.value;
        lflags.var2 = p1.value;
        lflags.res = result;
        lflags.oldcf = cpu.CF;
        lflags.type = w ? TypeFlag.t_ADDw : TypeFlag.t_ADDb;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);

    }

    private static Asm: string = 'ADD';
    protected static Tr = HelperSet.TR(this.Asm, '000000');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '000');
    protected static Ta = HelperSet.TA(this.Asm, '0000010')


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
        let w = config.w?.bin == '1' ? 16 : 8;
        let p0: GetterAndSetter;
        let p1: GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            } else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += ANDSet.Tr.bin(config).length;
        } else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ANDSet.Tc.bin(config).length;
        } else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += ANDSet.Ta.bin(config).length;
        } else {
            p1 = p0 = HZ;
        }

        const result = p0.value & p1.value;

        p0.value = result;
        lflags.var1 = p0.value;
        lflags.var2 = p1.value;
        lflags.res = result;
        lflags.oldcf = cpu.CF;
        lflags.type = w ? TypeFlag.t_ANDw : TypeFlag.t_ANDb;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);

    }

    private static Asm: string = 'AND';

    protected static Tr = HelperSet.TR(this.Asm, '001000');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '100');
    protected static Ta = HelperSet.TA(this.Asm, '0010010')


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
        const config: InstructionConfig = this;
        let n: number = 0;
        let size = 1;
        switch (config.i.bin) {
            case '0': //NEAR
                n = parseInt(config['disp'].asm!, 16);
                n += cpu.IP + 3;
                HelperSet.push(cpu, cpu.IP + 3);
                n = n & 0xFFFF;
                cpu.IP = n;
                break;
            case '1':
                HelperSet.push(cpu, cpu.IP + 3);
                n = parseInt(config['disp'].asm!, 16);
                cpu.IP = n;
                break;
            case '2':
                config.w = {bin: '1', asm: 'WORD'};
                let rm = HelperSet.rm(cpu, config);
                size = 2;
                if (config.ea) size += 2;
                if (config.disp)
                    if (config.disp.bin!.length > 8) size += 2;
                    else size += 1;
                HelperSet.push(cpu, cpu.IP + size);
                cpu.IP = rm.value;
                break;
            case '3':
                HelperSet.push(cpu, cpu.CS);
                HelperSet.push(cpu, cpu.IP + 5);
                cpu.CS = parseInt(config.disp.asm!, 16);
                cpu.IP = parseInt(config.ea.asm!, 16);
                break;
            case '4':
                HelperSet.push(cpu, cpu.CS);
                config.w = {bin: '1', asm: 'WORD'};
                let rmf = HelperSet.rm(cpu, config);
                size = 2;
                if (config.ea) size += 2;
                if (config.disp)
                    if (config.disp.bin!.length > 8) size += 2;
                    else size += 1;
                HelperSet.push(cpu, cpu.IP + size);
                console.log(rmf, rmf.value, rmf.next?.value.toString(16))
                if (rmf.next) {
                    cpu.CS = rmf.next?.value;
                    cpu.IP = rmf.value;
                } else {
                    if (HelperSet._asDOSBOX) {
                        cpu.CS = 0xF000;
                        cpu.IP = 0x1060;
                    } else throw new Error("Not such instruction!");
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
            // new InstructionSet(['(?<code>11111111)', '(?<mod>11)011(?<rm>[01]{3})'], {'i': '4', 'reg': '011'}),

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
            // new InstructionSet([`(?<code>CALL)\\s+FAR\\s+(?<rm>${Reg16_Key.join('|')})`], {
            //     'i': '4',
            //     'w': '1',
            //     'mod': '11'
            // }),
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
        cpu.CB = !cpu.CB;
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

function CMP<CPU extends TCPU>(a: number, b: number, w: number, cpu: CPU) {
    lflags.var1 = a;
    lflags.var2 = b;
    lflags.res = a - b;
    lflags.oldcf = cpu.CF;
    lflags.type = w ? TypeFlag.t_CMPw : TypeFlag.t_CMPb;
    HelperSet.UpdateFlags(lflags.type, cpu, lflags);
}

export class CMPSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let p0: GetterAndSetter;
        let p1: GetterAndSetter;
        if (config['_'].asm == 'tr') {
            if (config.d?.bin === '1') {
                p0 = HelperSet.reg(cpu, this);
                p1 = HelperSet.rm(cpu, this);
            } else {
                p0 = HelperSet.rm(cpu, this);
                p1 = HelperSet.reg(cpu, this);
            }
            cpu.IP += CMPSet.Tr.bin(config).length;
        } else if (config['_'].asm == 'tc') {
            p0 = HelperSet.rm(cpu, this);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += CMPSet.Tc.bin(config).length;
        } else if (config['_'].asm == 'ta') {
            p0 = HelperSet.get_setReg(cpu, w == 16, Reg8.AL);
            p1 = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
            cpu.IP += CMPSet.Ta.bin(config).length;
        } else {
            p1 = p0 = HZ;
        }
        CMP<CPU>(p0.value, p1.value, w, cpu);
    }

    private static Asm: string = 'CMP';

    protected static Tr = HelperSet.TR(this.Asm, '001110');
    protected static Tc = HelperSet.TC(this.Asm, '100000', '111');
    protected static Ta = HelperSet.TA(this.Asm, '0011110')


    constructor() {
        super([...CMPSet.Ta.binReg, ...CMPSet.Tc.binReg, ...CMPSet.Tr.binReg],
            [...CMPSet.Ta.asmReg, ...CMPSet.Tc.asmReg, ...CMPSet.Tr.asmReg],
            {}, CMPSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'tr':
                return CMPSet.Tr.asm(config);
            case 'tc':
                return CMPSet.Tc.asm(config);
            case 'ta':
                return CMPSet.Ta.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'tr':
                return CMPSet.Tr.bin(config);
            case 'tc':
                return CMPSet.Tc.bin(config);
            case 'ta':
                return CMPSet.Ta.bin(config);
        }
        return super.bin(config);
    }
}

export class CMPSSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Asm: string = 'CMPS';
    private static Bin: string = '1010011';

    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config: InstructionConfig = this;
        const w: number = config['w1'].bin == '1' ? 2 : 1;
        const p0 = w == 1 ? cpu.getMem8(cpu.SI) : cpu.getMem16(cpu.SI);
        const p1 = w == 1 ? cpu.getMem8(cpu.DI, cpu.ES) : cpu.getMem16(cpu.DI, cpu.ES);
        CMP<CPU>(p0, p1, w == 2 ? 16 : 8, cpu);
        if (cpu.DF == 0) {
            cpu.SI += w;
            cpu.DI += w;
        } else {
            cpu.SI -= w;
            cpu.DI -= w;
        }
        cpu.IP++;
    }

    constructor() {
        super([new InstructionSet([`(?<code>${CMPSSet.Bin})(?<w1>[01])`])],
            [new InstructionSet([`(?<code>${CMPSSet.Asm})(?<w1>B|W)`])], {}, CMPSSet.Run);
    }

    protected conf(raw: RawConfig, config: InstructionConfig): InstructionConfig | undefined {
        if (raw['w1'] == '0' || raw['w1'] == 'B') {
            config['w1'] = {
                bin: '0',
                asm: 'B'
            }
        } else {
            config['w1'] = {
                bin: '1',
                asm: 'W'
            }
        }

        return config;
    }

    protected asm(config: InstructionConfig): string {
        return CMPSSet.Asm + config['w1'].asm;
    }

    protected bin(config: InstructionConfig): string[] {
        return [CMPSSet.Bin + config['w1'].bin];
    }
}

export class CWDSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if (cpu.AX < 0x8000) cpu.DX = 0;
        else cpu.DX = 0xFFFF;
        cpu.IP += 1;
    }

    private static Bin: string = '10011001';
    private static Asm: string = 'CWD';

    constructor() {
        super(
            [new InstructionSet([CWDSet.Bin])],
            [new InstructionSet([CWDSet.Asm])],
            {},
            CWDSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [CWDSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return CWDSet.Asm;
    }

}

export class DAASet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if ((cpu.AL & 0x0F) > 9 || cpu.AB) {
            cpu.AL += 6;
            cpu.AF = 1;
        } else {
            cpu.AF = 0;
        }
        if ((cpu.AL & 0xF0) > 0x90 || cpu.CB) {
            cpu.AL += 0x60;
            cpu.CF = 1;
        } else {
            cpu.CF = 0;
        }
        cpu.SF = cpu.AL & 0x80;
        cpu.ZB = cpu.AL == 0;
        cpu.PB = HelperSet.calculateParityFlag(cpu.AL, 8);

        // HelperSet.UpdateFlags(cpu.AL, 8, cpu, new Set([FLAGS.S, FLAGS.Z, FLAGS.P]))
        cpu.IP += 1;
    }

    private static Bin: string = '00100111';
    private static Asm: string = 'DAA';

    constructor() {
        super(
            [new InstructionSet([DAASet.Bin])],
            [new InstructionSet([DAASet.Asm])],
            {},
            DAASet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [DAASet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return DAASet.Asm;
    }
}

export class DASSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if ((cpu.AL & 0x0F) > 9 || cpu.AB) {
            cpu.AL -= 6;
            cpu.AF = 1;
        } else {
            cpu.AF = 0;
        }

        if ((cpu.AL & 0xF0) > 0x90 || cpu.CB) {
            cpu.AL -= 0x60;
            cpu.CF = 1;
        } else {
            cpu.CF = 0;
        }

        cpu.SF = cpu.AL & 0x80;
        cpu.ZB = cpu.AL == 0;
        cpu.PB = HelperSet.calculateParityFlag(cpu.AL, 8);
        //HelperSet.UpdateFlags(cpu.AL, 8, cpu, new Set([FLAGS.S, FLAGS.Z, FLAGS.P]))
        cpu.IP += 1;
    }

    private static Bin: string = '00101111';
    private static Asm: string = 'DAS';

    constructor() {
        super(
            [new InstructionSet([DASSet.Bin])],
            [new InstructionSet([DASSet.Asm])],
            {},
            DASSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [DASSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return DASSet.Asm;
    }
}

export class DECSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let mask = (1 << w) - 1;
        let p: GetterAndSetter;
        if (config['_'].asm == 'fm') {
            p = HelperSet.rm(cpu, this);
            cpu.IP += DECSet.Fm.bin(config).length;
        } else if (config['_'].asm == 'fr') {
            p = HelperSet.reg(cpu, this);
            cpu.IP += DECSet.Fr.bin(config).length;
        } else {
            p = HZ;
        }
        const result = (p.value - 1) & mask;
        p.value = result;
        lflags.var1 = p.value;
        lflags.var2 = 1;
        lflags.res = result;
        lflags.oldcf = cpu.CF;
        lflags.type = w ? TypeFlag.t_DECw : TypeFlag.t_DECb;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);
    }

    private static Asm: string = 'DEC';
    protected static Fm = HelperSet.FM(this.Asm, '1111111', '001');
    protected static Fr = HelperSet.FR(this.Asm, '01001', true);


    constructor() {
        super([...DECSet.Fm.binReg, ...DECSet.Fr.binReg],
            [...DECSet.Fm.asmReg, ...DECSet.Fr.asmReg],
            {}, DECSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'fr':
                return DECSet.Fr.asm(config);
            case 'fm':
                return DECSet.Fm.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'fr':
                return DECSet.Fr.bin(config);
            case 'fm':
                return DECSet.Fm.bin(config);
        }
        return super.bin(config);
    }

}

export class DIVSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let qua, rm;
        if (w == 8) {
            let val = HelperSet.rm(cpu, this); //NUMR
            if (val.value == 0) EXCEPTION(0);
            qua = Math.floor(cpu.AX / val.value);
            let qua8 = qua & 0xFF;
            rm = cpu.AX % val.value;
            if (qua > 0xFF) EXCEPTION(0);
            qua = qua8;
            cpu.AH = rm;
            cpu.AL = qua8;
            qua = qua8;
        } else {
            let val = HelperSet.rm(cpu, this); //NUMR
            if (val.value == 0) EXCEPTION(0);
            qua = Math.floor(cpu.AX / val.value);
            let qua16 = qua & 0xFFFF;
            rm = cpu.AX % val.value;
            if (qua > 0xFFFF) EXCEPTION(0);
            cpu.DX = rm;
            cpu.AX = qua16;
            qua = qua16;
        }
        lflags.type = TypeFlag.t_DIV;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);
        if (HelperSet._asDOSBOX) {
            cpu.AF = cpu.SF = cpu.OF = 0;
            cpu.ZB = (rm === 0) && ((qua & 1) != 0);
            cpu.CB = ((rm & 3) >= 1) && ((rm & 3) <= 2);
            cpu.PF = (HelperSet.calculateParityFlag(rm, w) ? 1 : 0) ^
                (HelperSet.calculateParityFlag(qua, w) ? 1 : 0) ^
                cpu.PF;
        }
        cpu.IP += DIVSet.Fm.bin(config).length;
    }

    private static Asm: string = 'DIV';
    protected static Fm = HelperSet.FM(this.Asm, '1111011', '110');

    constructor() {
        super(DIVSet.Fm.binReg, DIVSet.Fm.asmReg, {}, DIVSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'fm':
                return DIVSet.Fm.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'fm':
                return DIVSet.Fm.bin(config);
        }
        return super.bin(config);
    }

}

export class ESCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;

        let rm = HelperSet.rm(cpu, this);
        console.log("FPU used ", rm.name);
        cpu.IP += ESCSet.bin(config).length;

    }

    constructor() {
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
            {name: {bin: '11011', asm: 'ESC'}}, ESCSet.Run);
    }

    protected bin(config: InstructionConfig): string[] {
        return ESCSet.bin(config);
    }

    protected static bin(config: InstructionConfig): string[] {
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

    }
}

let hlt: { cs: number, eip: number, decoder?: Function, old_decoder?: Function } = {
    cs: 0,
    eip: 0
};

function HLT_Decode<CPU extends TCPU>(cpu: CPU) {
    if (cpu.IP != hlt.eip || cpu.CS != hlt.cs) {
        hlt.decoder = hlt.old_decoder;
    } else {
        CPU_IODelayRemoved += CPU_Cycles;
        CPU_Cycles = 0;
    }
    return 0;
}

function CPU_HLT<CPU extends TCPU>(cpu: CPU, oldip: number) {
    if (hlt.decoder == HLT_Decode) throw new Error("CPU_HLT attempted to set HLT_Decode while CPU decoder already HLT_Decode.\\n\\nIf you see this message while installing FreeDOS, please use the normal CPU core.")
    cpu.IP = oldip;
    CPU_IODelayRemoved += CPU_Cycles;
    CPU_Cycles = 0;
    hlt.cs = cpu.CS;
    hlt.eip = cpu.IP;
    hlt.old_decoder = hlt.decoder;
    hlt.decoder = HLT_Decode;
}

export class HLTSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if (cpu.pmode && cpu.cpl) EXCEPTION(13);
        CPU_HLT(cpu, cpu.IP);
        cpu.IP += 1;
    }

    private static Bin: string = '00100111';
    private static Asm: string = 'HLT';

    constructor() {
        super(
            [new InstructionSet([HLTSet.Bin])],
            [new InstructionSet([HLTSet.Asm])],
            {},
            HLTSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [HLTSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return HLTSet.Asm;
    }
}

export class IDIVSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let qua, rm;
        if (w == 8) {
            let val = HelperSet.rm(cpu, this); //NUMR
            if (val.value == 0) EXCEPTION(0);
            qua = Math.floor(su(cpu.AX, 16) / su(val.value, w));
            let qua8 = qua & 0xFF;
            rm = su(cpu.AX, 16) % su(val.value, w);
            if (qua == -0x80 || qua == 0x80) EXCEPTION(0);
            if (qua != qua8) EXCEPTION(0);
            cpu.AH = rm;
            cpu.AL = qua8;
            qua = qua8;
        } else {
            let val = HelperSet.rm(cpu, this); //NUMR
            if (val.value == 0) EXCEPTION(0);
            qua = Math.floor(su(cpu.AX, 16) / su(val.value, w));
            let qua16 = qua & 0xFFFF;
            rm = su(cpu.AX, 16) % su(val.value, w);
            if (qua > 0xFFFF) EXCEPTION(0);
            cpu.DX = rm;
            cpu.AX = qua16;
            qua = qua16;
        }
        lflags.type = TypeFlag.t_DIV;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);
        if (HelperSet._asDOSBOX) {
            cpu.AF = cpu.SF = cpu.OF = 0;
            cpu.ZB = (rm === 0) && ((qua & 1) != 0);
            cpu.CB = ((rm & 3) >= 1) && ((rm & 3) <= 2);
            cpu.PF = (HelperSet.calculateParityFlag(rm, w) ? 1 : 0) ^
                (HelperSet.calculateParityFlag(qua, w) ? 1 : 0) ^
                cpu.PF;
        }
        cpu.IP += IDIVSet.Fm.bin(config).length;
    }

    private static Asm: string = 'IDIV';
    protected static Fm = HelperSet.FM(this.Asm, '1111011', '111');

    constructor() {
        super(IDIVSet.Fm.binReg, IDIVSet.Fm.asmReg, {}, IDIVSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'fm':
                return IDIVSet.Fm.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'fm':
                return IDIVSet.Fm.bin(config);
        }
        return super.bin(config);
    }

}

export class IMULSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let val = HelperSet.rm(cpu, this); //NUMR
        if (w == 8) {
            cpu.AX = us(cpu.AL, w) * us(val.value, w);
            if ((cpu.AX & 0xff80) == 0xff80 || (cpu.AX & 0xff80) == 0x0000) {
                cpu.OF = cpu.CF = 0;
            } else {
                cpu.OF = cpu.CF = 1;
            }
        } else {
            let tmp = us(cpu.AX, w) * us(val.value, w);
            cpu.AX = tmp;
            cpu.DX = tmp >> 16;
            if ((cpu.AX & 0xfff8000) == 0xffff8000 || (cpu.AX & 0xffff8000) == 0x0000) {
                cpu.OF = cpu.CF = 0;
            } else {
                cpu.OF = cpu.CF = 1;
            }
        }
        lflags.type = TypeFlag.t_MUL;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);
        if (HelperSet._asDOSBOX) {
            if (w == 8) {
                cpu.ZB = cpu.AL == 0;
                cpu.SF = cpu.AL & 0x80;
            } else {
                cpu.ZB = cpu.AX == 0;
                cpu.SF = cpu.AX & 0x8000;
            }
        }
        cpu.IP += IMULSet.Fm.bin(config).length;
    }

    private static Asm: string = 'IMUL';
    protected static Fm = HelperSet.FM(this.Asm, '1111011', '101');

    constructor() {
        super(IMULSet.Fm.binReg, IMULSet.Fm.asmReg, {}, IMULSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'fm':
                return IMULSet.Fm.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'fm':
                return IMULSet.Fm.bin(config);
        }
        return super.bin(config);
    }

}

export class INSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static _fp: string = '1110010';
    private static _vp: string = '1110110';
    private static _name: string = "IN";

    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config = this;
        let is16 = config.w_reg.bin == '1';
        let src = HelperSet.get_setReg(cpu, is16, ALL.AX);
        let port;
        if (config.i.bin == '0') {
            port = parseInt(config.port.bin!, 2);
        } else {
            port = HelperSet.get_setReg(cpu, true, ALL.DX).value;
        }
        src.value = cpu.readIO(port);
        if (is16) {
            src.value |= (cpu.readIO(port + 1) << 8);
        }

        cpu.IP += INSet.bin(config).length;
    }

    constructor() {
        super([
            new InstructionSet([`(?<code>${INSet._fp})(?<w_reg>[01])`, `(?<port>[01]{8})`], {'i': '0'}),
            new InstructionSet([`(?<code>${INSet._vp})(?<w_reg>[01])`], {'i': '1'})
        ], [
            new InstructionSet([`(?<code>${INSet._name})\\s+(?<w_reg>AX|AL)\\s*,\\s*(?<port>[0-9A-F]{2})`], {'i': '0'}),
            new InstructionSet([`(?<code>${INSet._name})\\s+(?<w_reg>AX|AL)\\s*,\\s*DX`], {'i': '1'}),
        ], {}, INSet.Run);
    }

    protected bin(config: InstructionConfig): string[] {
        return INSet.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        if (config.i.bin == '0')
            return `${INSet._name} ${config.w_reg.bin == '1' ? 'AX' : 'AL'}, ${config.port.asm}`;
        else if (config.i.bin == '1')
            return `${INSet._name} ${config.w_reg.bin == '1' ? 'AX' : 'AL'}, DX`;
        return super.asm(config);
    }

    protected static bin(config: InstructionConfig): string[] {
        if (config.i.bin == '0')
            return [`${INSet._fp}${config.w_reg.bin}`, `${config.port.bin}`]
        else if (config.i.bin == '1')
            return [`${INSet._vp}${config.w_reg.bin}`]
        return [];
    }

}

export class INCSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let w = config.w?.bin == '1' ? 16 : 8;
        let mask = (1 << w) - 1;
        let p: GetterAndSetter;
        if (config['_'].asm == 'fm') {
            p = HelperSet.rm(cpu, this);
            cpu.IP += INCSet.Fm.bin(config).length;
        } else if (config['_'].asm == 'fr') {
            p = HelperSet.reg(cpu, this);
            cpu.IP += INCSet.Fr.bin(config).length;
        } else {
            p = HZ;
        }
        const result = (p.value + 1) & mask;
        p.value = result;
        lflags.var1 = p.value;
        lflags.var2 = 1;
        lflags.res = result;
        lflags.oldcf = cpu.CF;
        lflags.type = w ? TypeFlag.t_INCw : TypeFlag.t_INCb;
        HelperSet.UpdateFlags(lflags.type, cpu, lflags);
    }

    private static Asm: string = 'DEC';
    protected static Fm = HelperSet.FM(this.Asm, '1111111', '000');
    protected static Fr = HelperSet.FR(this.Asm, '01000', true);


    constructor() {
        super([...INCSet.Fm.binReg, ...INCSet.Fr.binReg],
            [...INCSet.Fm.asmReg, ...INCSet.Fr.asmReg],
            {}, INCSet.Run);
    }

    protected asm(config: InstructionConfig): string {
        switch (config['_'].asm) {
            case 'fr':
                return INCSet.Fr.asm(config);
            case 'fm':
                return INCSet.Fm.asm(config);
        }
        return super.asm(config);
    }

    protected bin(config: InstructionConfig): string[] {
        switch (config['_'].asm) {
            case 'fr':
                return INCSet.Fr.bin(config);
            case 'fm':
                return INCSet.Fm.bin(config);
        }
        return super.bin(config);
    }

}

export class INTSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let config: InstructionConfig = this;
        let port = config.port?.asm ?? '03';
        cpu.interupt(parseInt(port, 16));
        cpu.IP += 1;
        if ((config.port.asm != '03' && config._.asm == '2') || config._.asm == '1')
            cpu.IP += 1;
    }

    constructor() {
        super([
            new InstructionSet([`11001100`], {port: '03', _: '0'}),
            new InstructionSet([`11001101`, `(?<port>[01]{8})`], {_: '1'}),
        ], [
            new InstructionSet([`INT\\s+(?<port>[0-9A-F]{2})`], {_: '2'}),
        ], {}, INTSet.Run);
    }

    protected bin(config: InstructionConfig): string[] {
        if ((config.port.asm == '03' && config._.asm == '2') || config._.asm == '0')
            return [`11001100`];
        return [`11001101`, config.port.bin!];
    }

    protected asm(config: InstructionConfig): string {
        if (config.port.asm == '03')
            return `INT 03`;
        return `INT ${config.port.asm}`;
    }
}

export class INTOSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        if (cpu.pmode && cpu.cpl) EXCEPTION(13);
        cpu.interupt(4);
        cpu.IP += 1;
    }

    private static Bin: string = '11001110';
    private static Asm: string = 'INTO';

    constructor() {
        super(
            [new InstructionSet([INTOSet.Bin])],
            [new InstructionSet([INTOSet.Asm])],
            {},
            INTOSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [INTOSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return INTOSet.Asm;
    }
}

export class IRETSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.IP = HelperSet.pop(cpu);
        cpu.CS = HelperSet.pop(cpu);
        cpu.set16(ALL.FLAGS, HelperSet.pop(cpu));
    }

    private static Bin: string = '11001111';
    private static Asm: string = 'IRET';

    constructor() {
        super(
            [new InstructionSet([IRETSet.Bin])],
            [new InstructionSet([IRETSet.Asm])],
            {},
            IRETSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [IRETSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return IRETSet.Asm;
    }
}

const TFLG = {
    O(cpu: TCPU) {
        return cpu.OB
    },
    NO(cpu: TCPU) {
        return !cpu.OB
    },
    B(cpu: TCPU) {
        return cpu.CB
    },
    NB(cpu: TCPU) {
        return !cpu.CB
    },
    Z(cpu: TCPU) {
        return cpu.ZB
    },
    NZ(cpu: TCPU) {
        return !cpu.ZB
    },
    BE(cpu: TCPU) {
        return cpu.CB || cpu.ZB
    },
    NBE(cpu: TCPU) {
        return !cpu.CB && !cpu.ZB;
    },
    S(cpu: TCPU) {
        return cpu.SB;
    },
    NS(cpu: TCPU) {
        return !cpu.SB;
    },
    P(cpu: TCPU) {
        return cpu.PB;
    },
    NP(cpu: TCPU) {
        return !cpu.PB;
    },
    L(cpu: TCPU) {
        return cpu.SB != cpu.OB;
    },
    NL(cpu: TCPU) {
        return cpu.SB == cpu.OB;
    },
    LE(cpu: TCPU) {
        return !cpu.ZB || (cpu.SB != cpu.OB)
    },
    NLE(cpu: TCPU) {
        return cpu.ZB && (cpu.SB == cpu.OB)
    }
}

class JSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private _cpu: CPU;

    protected static GO<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config = this;
        cpu.IP += parseInt(config.disp.bin!, 2) + (config.i.bin == '0' ? 2 : 0);
    }

    constructor(name: string, bin: string, cpu: CPU, k: (cpu: CPU) => void) {
        super([
            new InstructionSet([`(?<code>${bin})`, `(?<disp>[01]{8})`], {i: '0', 'mod': '00'})
        ], [
            new InstructionSet([`(?<code>${name})\\s+(?<disp>[0-9A-F]{2})`], {i: '1', mod: '00'}),
        ], {
            name: {bin: bin, asm: name},
        }, k);
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

export class JASet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NBE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JA', '01110111', cpu, JASet.Run);
    }
}

export class JAESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NB(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JAE', '01110011', cpu, JAESet.Run);
    }
}

export class JBSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.B(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JB', '01110010', cpu, JBSet.Run);
    }
}

export class JBESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.BE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JBE', '01110110', cpu, JBESet.Run);
    }
}

export class JCSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.B(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JC', '01110010', cpu, JCSet.Run);
    }
}

export class JCXZSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (cpu.CX == 0) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JCXZ', '11100011', cpu, JCXZSet.Run);
    }
}

export class JESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.Z(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JE', '01110100', cpu, JESet.Run);
    }
}

export class JGSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NLE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JG', '01111111', cpu, JGSet.Run);
    }
}

export class JGESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NL(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JGE', '01111101', cpu, JGESet.Run);
    }
}

export class JLSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.L(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JL', '01111100', cpu, JLSet.Run);
    }
}

export class JLESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.LE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JLE', '01111110', cpu, JLESet.Run);
    }
}

export class JMPSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private _cpu: CPU;

    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config = this;
        let disp: number = 0;
        let ea: number = 0;
        if (config.i.bin == '0') {
            disp = parseInt(config.disp.asm!, 16) + 3;
            cpu.IP = disp;
        } else if (config.i.bin == '1') {
            disp = parseInt(config.disp.asm!, 16);
            cpu.IP = disp;
        } else if (config.i.bin == '2') {
            let sn = parseInt(config['disp'].bin!, 2);
            let bit16 = new Uint16Array(1);
            let bit8 = new Uint8Array(bit16.buffer);
            bit16[0] = cpu.IP;
            sn += 2;
            bit8[0] += sn;
            cpu.IP = bit16[0];

        } else if (config.i.bin == '3') {
            let sn = parseInt(config['disp'].asm!, 16);
            let bit16 = new Uint16Array(1);
            let bit8 = new Uint8Array(bit16.buffer);
            bit16[0] = cpu.IP;
            bit8[0] += sn;
            cpu.IP = bit16[0];
        } else if (config.i.bin == '4') {
            let rm = HelperSet.rm(cpu, this);
            cpu.IP = rm.value;
        } else if (config.i.bin == '5') {
            disp = parseInt(config.disp.asm!, 16);
            ea = parseInt(config.ea.asm!, 16);
            cpu.IP = ea;
            cpu.CS = disp;
        } else if (config.i.bin == '6') {
            let rm = HelperSet.rm(cpu, this);
            cpu.IP = rm.value;
            cpu.CS = rm.next!.value;
        } else {
            console.log(config);
        }

    }

    constructor(cpu: CPU) {
        super([
            new InstructionSet(['(?<code>11101001)', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {'i': '0', 'mod': '0'}),
            new InstructionSet(['(?<code>11101011)', '(?<disp>[01]{8})'], {'i': '2', 'mod': '01'}),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)100(?<rm>000|001|010|011|100|101|111)'], {
                'i': '4',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)100(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '4',
                'w': '1',
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
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)100(?<rm>[01]{3})'], {
                'i': '4',
                'w': '1',
                'reg': '010'
            }),
            new InstructionSet(['(?<code>11101010)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '5',
                'mod': '0'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)101(?<rm>000|001|010|011|100|101|111)'], {
                'i': '6',
                'w': '1',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>00)101(?<rm>110)', '(?<ea>[01]{8})', '(?<ea2>[01]{8})'], {
                'i': '6',
                'w': '1',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>01)101(?<rm>[01]{3})', '(?<disp>[01]{8})'], {
                'i': '6',
                'w': '1',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>10)101(?<rm>[01]{3})', '(?<disp>[01]{8})', '(?<disp2>[01]{8})'], {
                'i': '6',
                'w': '1',
                'reg': '011'
            }),
            new InstructionSet(['(?<code>11111111)', '(?<mod>11)101(?<rm>[01]{3})'], {
                'i': '6',
                'w': '1',
                'reg': '011'
            }),

        ], [
            new InstructionSet([`(?<code>JMP)\\s+(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})`], {'i': '1', 'mod': '0'}),
            new InstructionSet([`(?<code>JMP)\\s+(?<disp>[\\+\\-][0-9A-F]{2})`], {'i': '3', 'mod': '01'}),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '4',
                'w': '1',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'rm': '110',
                'w': '1',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'w': '1',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>JMP)\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '4',
                'w': '1',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+(?<rm>${Reg16_Key.join('|')})`], {'i': '4', 'w': '1', 'mod': '11'}),
            new InstructionSet([`(?<code>JMP)\\s(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*:\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})`], {
                'i': '5',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*\\]`], {
                'i': '6',
                'mod': '00',
                'w': '1',
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'w': '1',
                'rm': '110',
                'mod': '00'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[+-]\s*[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'w': '1',
                'mod': '01'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})\(?<disp2>[0-9A-F]{2})\\s*\\]`], {
                'i': '6',
                'w': '1',
                'mod': '10'
            }),
            new InstructionSet([`(?<code>JMP)\\s+FAR\\s+(?<rm>${Reg16_Key.join('|')})`], {
                'i': '6',
                'w': '1',
                'mod': '11'
            }),
        ], {}, JMPSet.Run);
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
                let sn = parseInt(config['disp'].bin!, 2);
                sn += 2;
                sn = us(sn & 0xFF, 8);
                if (sn < 0) {
                    sn = -sn;
                    return `JMP -${sn.toString(16).padStart(2, '0')}`
                }
                return `JMP +${sn.toString(16).padStart(2, '0')}`;
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
        return JMPSet.bin(config, this._cpu);
    }

    protected static bin<CPU extends TCPU>(config: InstructionConfig, cpu: CPU): string[] {
        switch (config.i.bin) {
            case '0':
                return ['11101001', `${config.disp.bin?.substring(0, 8)}`, `${config.disp.bin?.substring(8)}`]
            case '1':
                let n = parseInt(config['disp'].asm!, 16);
                n -= cpu.IP + 3;
                n = n & 0xFFFF;
                let bin = n.toString(2).padStart(16, '0');
                return ['11101001', bin.substring(8), bin.substring(0, 8)]
            case '2':
                return ['11101011', `${config.disp.bin}`]
            case '3':
                let sn = parseInt(config['disp'].asm!, 16);
                sn -= 2;
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

export class JNASet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.BE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNA', '01110110', cpu, JNASet.Run);
    }
}

export class JNAESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.B(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNAE', '01110010', cpu, JNAESet.Run);
    }
}

export class JNBSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NB(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNB', '01110011', cpu, JNBSet.Run);
    }
}

export class JNBESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NBE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNBE', '01110111', cpu, JNBESet.Run);
    }
}

export class JNCSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NB(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNC', '01110011', cpu, JNCSet.Run);
    }
}

export class JNESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NZ(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNE', '01110101', cpu, JNESet.Run);
    }
}

export class JNGSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.LE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNG', '01111110', cpu, JNGSet.Run);
    }
}

export class JNGESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.L(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNGE', '01111100', cpu, JNGESet.Run);
    }
}

export class JNLSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NL(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNL', '01111101', cpu, JNLSet.Run);
    }
}

export class JNLESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NLE(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNLE', '01111111', cpu, JNLESet.Run);
    }
}

export class JNOSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NO(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNO', '01110001', cpu, JNOSet.Run);
    }
}

export class JNPSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NP(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNP', '01111011', cpu, JNPSet.Run);
    }
}

export class JNSSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NS(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNS', '01111001', cpu, JNSSet.Run);
    }
}

export class JNZSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NZ(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JNZ', '01110101', cpu, JNZSet.Run);
    }
}

export class JOSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.O(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JO', '01110000', cpu, JOSet.Run);
    }
}

export class JPSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.P(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JP', '01111010', cpu, JPSet.Run);
    }
}

export class JPESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.P(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JPE', '01111010', cpu, JPESet.Run);
    }
}

export class JPOSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.NP(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JPO', '01111011', cpu, JPOSet.Run);
    }
}

export class JSSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.S(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JS', '01111000', cpu, JSSet.Run);
    }
}

export class JZSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        if (TFLG.Z(cpu)) JSet.GO.call(this, cpu); else cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('JZ', '01110100', cpu, JZSet.Run);
    }
}

export class LAHFSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        cpu.AH = cpu.get16(ALL.FLAGS)
        cpu.IP += 1;
    }

    private static Bin: string = '10011111';
    private static Asm: string = 'LAHF';

    constructor() {
        super(
            [new InstructionSet([LAHFSet.Bin])],
            [new InstructionSet([LAHFSet.Asm])],
            {},
            LAHFSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [LAHFSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return LAHFSet.Asm;
    }
}

export class LDSSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config: InstructionConfig = this;
        let reg = HelperSet.reg(cpu, config);
        let rm = HelperSet.rm(cpu, config);
        reg.value = rm.value;
        cpu.DS = rm.next!.value;
        cpu.IP += LDSSet.Tr.bin(this).length;
    }


    private static Asm: string = 'LDS';
    protected static Tr = HelperSet.TRDW(this.Asm, '11000101', true, true);

    constructor() {
        super(
            LDSSet.Tr.binReg,
            LDSSet.Tr.asmReg,
            {},
            LDSSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return LDSSet.Tr.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        return LDSSet.Tr.asm(config);
    }
}

export class LEASet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config: InstructionConfig = this;
        let reg = HelperSet.reg(cpu, config);
        let rm = HelperSet.rm(cpu, config);
        reg.value = rm.value;
        cpu.IP += LEASet.Tr.bin(this).length;
    }


    private static Asm: string = 'LEA';
    protected static Tr = HelperSet.TRDW(this.Asm, '10001101', true, true);

    constructor() {
        super(
            LEASet.Tr.binReg,
            LEASet.Tr.asmReg,
            {},
            LEASet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return LEASet.Tr.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        return LEASet.Tr.asm(config);
    }
}

export class LESSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config: InstructionConfig = this;
        let reg = HelperSet.reg(cpu, config);
        let rm = HelperSet.rm(cpu, config);
        reg.value = rm.value;
        cpu.ES = rm.next!.value;
        cpu.IP += LESSet.Tr.bin(this).length;
    }


    private static Asm: string = 'LES';
    protected static Tr = HelperSet.TRDW(this.Asm, '11000101', true, true);

    constructor() {
        super(
            LESSet.Tr.binReg,
            LESSet.Tr.asmReg,
            {},
            LESSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return LESSet.Tr.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        return LESSet.Tr.asm(config);
    }
}

export class LOCKSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(cpu: CPU) {
        console.warn("TODO CPU:LOCK");
        cpu.IP += 1;
    }

    private static Bin: string = '11110000';
    private static Asm: string = 'LOCK';

    constructor() {
        super(
            [new InstructionSet([LOCKSet.Bin])],
            [new InstructionSet([LOCKSet.Asm])],
            {},
            LOCKSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        return [LOCKSet.Bin]
    }

    protected asm(config: InstructionConfig): string {
        return LOCKSet.Asm;
    }
}

export class LODSSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        let w = this.w.bin == '1';
        let reg = HelperSet.get_setReg(cpu, w, ALL.AX);
        reg.value = w ? cpu.getMem16(cpu.SI, cpu.DS) : cpu.getMem8(cpu.SI, cpu.DS);
        let delta = w ? 2 : 1;
        if (cpu.DB) {
            delta = -delta;
        }
        cpu.SI += delta;
        cpu.IP += 1;
    }

    private static Bin: string = '1010110';
    private static Asm: string = 'LODS';

    constructor() {
        super(
            [new InstructionSet([`(?<code>${LODSSet.Bin})(?<w>[01])`])],
            [
                new InstructionSet([`LODSB`], {w: '0'}),
                new InstructionSet([`LODSW`], {w: '1'}),
            ],
            {},
            LODSSet.Run)
    }

    protected bin(config: InstructionConfig): string[] {
        if (config.w.asm == '1')
            return ['10101101'];
        return ['10101100'];
    }

    protected asm(config: InstructionConfig): string {
        if (config.w.asm == '1')
            return 'LODSW';
        return 'LODSB';
    }
}

export class LOOPSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        cpu.CX -= 1;
        if (cpu.CX != 0)
            JSet.GO.call(this, cpu);
        else
            cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('LOOP', '11100010', cpu, LOOPSet.Run);
    }
}

export class LOOPZSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        cpu.CX -= 1;
        if (cpu.CX != 0 && cpu.ZB)
            JSet.GO.call(this, cpu);
        else
            cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('LOOPZ', '11100001', cpu, LOOPZSet.Run);
    }


}

export class LOOPESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        cpu.CX -= 1;
        if (cpu.CX != 0 && cpu.ZB)
            JSet.GO.call(this, cpu);
        else
            cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('LOOPE', '11100001', cpu, LOOPESet.Run);
    }


}

export class LOOPNESet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        cpu.CX -= 1;
        if (cpu.CX != 0 && !cpu.ZB)
            JSet.GO.call(this, cpu);
        else
            cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('LOOPNE', '11100000', cpu, LOOPNESet.Run);
    }


}

export class LOOPNZSet<CPU extends TCPU> extends JSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        cpu.CX -= 1;
        if (cpu.CX != 0 && !cpu.ZB)
            JSet.GO.call(this, cpu);
        else
            cpu.IP += 2;
    }

    constructor(cpu: CPU) {
        super('LOOPNZ', '11100000', cpu, LOOPNZSet.Run);
    }


}

export class MOVSet<CPU extends TCPU> extends HelperSet<CPU> implements ISetInstruction<CPU> {
    private static Run<CPU extends TCPU>(this: InstructionConfig, cpu: CPU) {
        const config = this;
        let src: GetterAndSetter = HZ;
        let dst: GetterAndSetter = HZ;
        switch (config._.asm) {
            case 'tr':
                if(config.d.bin == '1'){
                    src = HelperSet.rm(cpu, config);
                    dst = HelperSet.reg(cpu, config);
                }
                else {
                    dst = HelperSet.rm(cpu, config);
                    src = HelperSet.reg(cpu, config);
                }
                break;
            case 'fm':
                dst = HelperSet.rm(cpu, config);
                src = HelperSet.get_setCONST(parseInt(config.val.asm!, 16));
                break;
            case 'rm': {
                src = HelperSet.get_setCONST(parseInt(config.val.asm!, 16))
                dst = HelperSet.get_setReg(cpu, config.w.bin == '1', parseInt(config.reg.bin!,2))
            }
                break;
            case 'ea': {
                if(config.d.bin == '1'){
                    dst = HelperSet.get_setAddr(cpu, config.w_reg.bin == '1' , parseInt(config.ea.asm!, 16));
                    src = HelperSet.get_setReg(cpu, config.w_reg.bin == '1', ALL.AX)
                }
                else {
                    src = HelperSet.get_setAddr(cpu, config.w_reg.bin == '1' , parseInt(config.ea.asm!, 16));
                    dst = HelperSet.get_setReg(cpu, config.w_reg.bin == '1', ALL.AX)
                }
                console.log(dst, src);
            }
                break;
            case 'sg': {
                const seg = HelperSet.get_setReg(cpu, true, parseInt(config.seg.bin!, 2) + 8);
                const rm = HelperSet.rm(cpu, config);
                if(config.d.bin == '1'){
                    src = rm;
                    dst = seg;
                }
                else {
                    src = seg;
                    dst = rm;
                }

            }
                break;
        }
        dst.value = src.value;
        cpu.IP = MOVSet.bin(config).length;
    }

    constructor() {
        super([
            new InstructionSet([`(?<code>100010)(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>000|001|010|011|100|101|111)`], {_: 'tr'}),
            new InstructionSet([`(?<code>100010)(?<d>[01])(?<w>[01])`, `(?<mod>00)(?<reg>[01]{3})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>100010)(?<d>[01])(?<w>[01])`, `(?<mod>01)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>100010)(?<d>[01])(?<w>[01])`, `(?<mod>10)(?<reg>[01]{3})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`], {_: 'tr'}),
            new InstructionSet([`(?<code>100010)(?<d>[01])(?<w>[01])`, `(?<mod>11)(?<reg>[01]{3})(?<rm>[01]{3})`], {_: 'tr'}),

            new InstructionSet([`(?<code>1100011)(?<w>0)`, `(?<mod>00)(?<reg>000)(?<rm>000|001|010|011|100|101|111)`, `(?<val>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>0)`, `(?<mod>00)(?<reg>000)(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`, `(?<val>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>0)`, `(?<mod>01)(?<reg>000)(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<val>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>0)`, `(?<mod>10)(?<reg>000)(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`, `(?<val>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>0)`, `(?<mod>11)(?<reg>000)(?<rm>[01]{3})`, `(?<val>[01]{8})`], {_: 'fm'}),

            new InstructionSet([`(?<code>1100011)(?<w>1)`, `(?<mod>00)(?<reg>000)(?<rm>000|001|010|011|100|101|111)`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>1)`, `(?<mod>00)(?<reg>000)(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>1)`, `(?<mod>01)(?<reg>000)(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>1)`, `(?<mod>10)(?<reg>000)(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'fm'}),
            new InstructionSet([`(?<code>1100011)(?<w>1)`, `(?<mod>11)(?<reg>000)(?<rm>[01]{3})`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'fm'}),

            new InstructionSet([`(?<code>1011)(?<w>0)(?<reg>[01]{3})`, `(?<val>[01]{8})`], {_: 'rm'}),
            new InstructionSet([`(?<code>1011)(?<w>1)(?<reg>[01]{3})`, `(?<val>[01]{8})`, `(?<val2>[01]{8})`], {_: 'rm'}),


            new InstructionSet([`(?<code>101000)(?<d>[01])(?<w_reg>[01])`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {_: 'ea'}),

            new InstructionSet([`(?<code>100011)(?<d>[01])0`, `(?<mod>00)0(?<seg>[01]{2})(?<rm>000|001|010|011|100|101|111)`], {
                _: 'sg',
                w: '1'
            }),
            new InstructionSet([`(?<code>100011)(?<d>[01])0`, `(?<mod>00)0(?<seg>[01]{2})(?<rm>110)`, `(?<ea>[01]{8})`, `(?<ea2>[01]{8})`], {
                _: 'sg',
                w: '1'
            }),
            new InstructionSet([`(?<code>100011)(?<d>[01])0`, `(?<mod>01)0(?<seg>[01]{2})(?<rm>[01]{3})`, `(?<disp>[01]{8})`], {
                _: 'sg',
                w: '1'
            }),
            new InstructionSet([`(?<code>100011)(?<d>[01])0`, `(?<mod>10)0(?<seg>[01]{2})(?<rm>[01]{3})`, `(?<disp>[01]{8})`, `(?<disp2>[01]{8})`], {
                _: 'sg',
                w: '1'
            }),
            new InstructionSet([`(?<code>100011)(?<d>[01])0`, `(?<mod>11)0(?<seg>[01]{2})(?<rm>[01]{3})`], {
                _: 'sg',
                w: '1'
            }),
        ], [
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "0", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", "rm": "110", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*(?<rm>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "1", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<reg>${Reg8_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "0", _: "tr"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<reg>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "1", _: "tr"}),

            new InstructionSet([`(?<code>MOV)\\s+(?<w>BYTE)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`],
                {"mod": "00", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>BYTE)\\s+PTR\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`],
                {"mod": "00", "reg": '000', "rm": "110", "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>BYTE)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`],
                {"mod": "01", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>BYTE)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})`],
                {"mod": "10", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<rm>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})`], {
                "mod": "11",
                "w": "0",
                "reg": '000',
                "_": "fm"
            }),

            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg8_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})`], {_:'rm', w: '0'}),
            new InstructionSet([`(?<code>MOV)\\s+(?<reg>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`], {_:'rm', w: '1'}),

            new InstructionSet([`(?<code>MOV)\\s+(?<w>WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`],
                {"mod": "00", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>WORD)\\s+PTR\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`],
                {"mod": "00", "reg": '000', "rm": "110", "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`],
                {"mod": "01", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<w>WORD)\\s+PTR\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`],
                {"mod": "10", "reg": '000', "_": "fm"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<val>[0-9A-F]{2})(?<val2>[0-9A-F]{2})`], {
                "mod": "11",
                "w": "1",
                "reg": '000',
                "_": "fm"
            }),

            new InstructionSet([`(?<code>MOV)\\s+(?<w_reg>AL|AX)\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {_: "ea", d: '0'}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<w_reg>AL|AX)`],
                {_: "ea", d: '1'}),

            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]\\s*,\\s*(?<seg>${Seg_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<seg>${Seg_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.filter(x => x != 'BP').join('|')})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<seg>${Seg_Key.join('|')})`],
                {"mod": "00", "d": "0", "w": "1", "rm": "110", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<seg>${Seg_Key.join('|')})\\s*,\\s*\\[\\s*(?<ea>[0-9A-F]{2})(?<ea2>[0-9A-F]{2})\\s*]`],
                {"mod": "00", "d": "1", "w": "1", "rm": "110", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]\\s*,\\s*(?<seg>${Seg_Key.join('|')})`],
                {"mod": "01", "d": "0", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<seg>${Seg_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*(?<disp>[\\+\\-]\\s*[0-9A-F]{2})\\s*]`],
                {"mod": "01", "d": "1", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]\\s*,\\s*(?<seg>${Seg_Key.join('|')})`],
                {"mod": "10", "d": "0", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<seg>${Seg_Key.join('|')})\\s*,\\s*\\[\\s*(?<rm>${RM_Key.join('|')})\\s*\\+\\s*(?<disp>[0-9A-F]{2})(?<disp2>[0-9A-F]{2})\\s*]`],
                {"mod": "10", "d": "1", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<rm>${Reg16_Key.join('|')})\\s*,\\s*(?<seg>${Seg_Key.join('|')})`],
                {"mod": "11", "d": "0", "w": "1", _: "sg"}),
            new InstructionSet([`(?<code>MOV)\\s+(?<seg>${Seg_Key.join('|')})\\s*,\\s*(?<rm>${Reg16_Key.join('|')})`],
                {"mod": "11", "d": "1", "w": "1", _: "sg"}),

        ], {}, MOVSet.Run);
    }

    protected static bin(config: InstructionConfig): string[] {
        switch (config._.asm) {
            case 'tr': {
                let list = ['100010' + config.d.bin! + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
                if (config.mod.bin == "00" && config.rm.bin == "110") {
                    list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
                } else if (config.mod.bin == "01") {
                    list.push(config.disp.bin!);
                } else if (config.mod.bin == "10") {
                    list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
                }
                return list;
            }
            case 'fm': {
                let list = ['1100011' + config.w.bin!, config.mod.bin! + config.reg.bin! + config.rm.bin!];
                if (config.mod.bin == "00" && config.rm.bin == "110") {
                    list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
                } else if (config.mod.bin == "01") {
                    list.push(config.disp.bin!);
                } else if (config.mod.bin == "10") {
                    list.push(config.disp.bin!.substring(0, 8), config.disp.bin!.substring(8))
                }
                if (config.w.bin == '1')
                    list.push(config.val.bin!.substring(0, 8), config.val.bin!.substring(8))
                else
                    list.push(config.val.bin!)
                return list;
            }
            case 'rm': {
                let list = [`1011${config.w.bin}${config.reg.bin}`];
                if (config.w.bin == '1')
                    list.push(config.val.bin!.substring(0, 8), config.val.bin!.substring(8))
                else
                    list.push(config.val.bin!)
                return list;
            }
            case 'ea': {
                let w = config.w_reg.bin == '1';
                let list = ['101000' + (config.d.bin) + (w ? '1' : '0')];
                list.push(config.ea.bin!.substring(0, 8), config.ea.bin!.substring(8))
                return list;
            }
            case 'sg': {
                let list = ['100011' + config.d.bin! + '0', config.mod.bin! + '0'+ config.seg.bin! + config.rm.bin!];
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
        throw "TODO " + JSON.stringify(config)
        // return [];
    }

    protected bin(config: InstructionConfig): string[] {
        return MOVSet.bin(config);
    }

    protected asm(config: InstructionConfig): string {
        switch (config._.asm) {
            case 'tr': {
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
                    return `MOV ${p2}, ${p1}`
                else
                    return `MOV ${p1}, ${p2}`
            }
            case 'fm': {
                let disp = config.disp?.asm ?? "";
                let val = config.val?.asm ?? "";
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

                return 'MOV' + ` ${p}, ${val}`
            }
            case 'rm': {
                let val = config.val?.asm ?? "";

                return `MOV ${config.reg.asm}, ${val}`
            }
            case 'ea': {
                let w = config.w_reg.bin == '1';
                let d = config.d.bin == '1';
                let p0 = '[' + config.ea.asm + ']';
                let p1 = w ? 'AX' : 'AL';
                //   console.log(d, p0, p1);
                return d ? `MOV ${p0}, ${p1}` : `MOV ${p1}, ${p0}`;
            }
            case 'sg': {
                const p1 = config.seg.asm!;
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
                    return `MOV ${p2}, ${p1}`
                else
                    return `MOV ${p1}, ${p2}`
            }
        }
        return super.asm(config);
    }

}

let CPU_IODelayRemoved: number;
let CPU_Cycles: number;

export default class TCPU extends ACPU {
    private _regs: Memory = new Memory(0x20);
    private _mem: Memory = new Memory(0xFFFFF);
    private _io: { [port: number]: GetterAndSetter } = {};
    pmode: boolean = false;
    cpl: number = 0;

    interupt(port: number) {
        if (port == 4) { //INTO
            if (this.OB) {
                HelperSet.push(this, this.get16(ALL.FLAGS));
                this.IF = this.TF = 0;
                HelperSet.push(this, this.get16(ALL.CS));
                HelperSet.push(this, this.get16(ALL.SP));
                this.CS = 0x12;
                this.IP = 0x10;
            }
        }
        console.warn("TODO " + port);
    }

    setIO(port: number, gs: GetterAndSetter) {
        this._io[port] = gs;
    }

    readIO(port: number) {
        let gs = this._io[port];
        if (gs) {
            return gs.value;
        }
        console.error("Read port " + port);
        return 0;
    }

    writeIO(port: number, val: number) {
        let gs = this._io[port];
        if (gs) {
            gs.value = val;
        }
        console.error("Write port " + port);
    }

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

    get CB(): boolean {
        return this.getF(FLAGS.C);
    }

    get ZB(): boolean {
        return this.getF(FLAGS.Z)
    }

    get SB(): boolean {
        return this.getF(FLAGS.S)
    }

    get OB(): boolean {
        return this.getF(FLAGS.O)
    }

    get PB(): boolean {
        return this.getF(FLAGS.P)
    }

    get AB(): boolean {
        return this.getF(FLAGS.A)
    }

    get IB(): boolean {
        return this.getF(FLAGS.I)
    }

    get DB(): boolean {
        return this.getF(FLAGS.D)
    }

    get TB(): boolean {
        return this.getF(FLAGS.T)
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

    set CB(b: boolean) {
        this.setF(FLAGS.C, b);
    }

    set ZB(b: boolean) {
        this.setF(FLAGS.Z, b);
    }

    set SB(b: boolean) {
        this.setF(FLAGS.S, b);
    }

    set OB(b: boolean) {
        this.setF(FLAGS.O, b);
    }

    set PB(b: boolean) {
        this.setF(FLAGS.P, b);
    }

    set AB(b: boolean) {
        this.setF(FLAGS.A, b);
    }

    set IB(b: boolean) {
        this.setF(FLAGS.I, b);
    }

    set DB(b: boolean) {
        this.setF(FLAGS.D, b);
    }

    set TB(b: boolean) {
        this.setF(FLAGS.T, b);
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

    showMem(seg: number, offset?: number): string {
        if (!offset) offset = 0;
        let tseg = seg.toString(16).padStart(4, '0');
        let toffset = offset.toString(16).padStart(4, '0');
        if (seg == this.DS) tseg = 'DS';
        if (seg == this.ES) tseg = 'ES';
        if (seg == this.SS) tseg = 'SS';
        if (seg == this.CS) tseg = 'CS';
        let str = `${tseg}:${toffset}\t`;
        for (let i = 0; i < 8; i++) {
            str += `${this.getMem8(offset + i, seg).toString(16).padStart(2, '0')}\t`;
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