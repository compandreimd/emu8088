import {coerceBoolean} from "openai/core";
import {throws} from "node:assert";

enum Size {
    Bit,
    Byte,
    Word,
    DWord
}

class Mem {
    private mem8: Uint8Array;
    private mem16: Uint16Array;
    private mem32: Uint32Array;

    constructor(size: number) {
        this.mem32 = new Uint32Array(size);
        this.mem16 = new Uint16Array(this.mem32.buffer);
        this.mem8 = new Uint8Array(this.mem32.buffer);
    }

    write(arr: number[], offset?: number) {
        for (let i = offset ?? 0; i < arr.length && i < this.mem8.length; i++) {
            this.mem8[i] = arr[i];
        }
    }

    read(size: number, offset?: number): number[] {
        offset = offset || 0;
        let arr: number[] = [];
        for (let i = offset; i < offset + size; i++) {
            arr.push(this.mem8[i]);
        }
        return arr;
    }

    get(s: Size, offset?: number): number {
        offset = offset ?? 0;
        switch (s) {
            case Size.Bit: {
                return this.mem8[Math.floor(offset / 8)].toString(2).padStart(8, '0')[offset % 8] == '1' ? 1 : 0;
            }
            case Size.Byte:
                return this.mem8[offset];
            case Size.Word:
                return this.get(Size.Byte, offset + BL_INDEX) | (this.get(Size.Byte, offset + BH_INDEX) << 8);
            case Size.DWord:
                return this.get(Size.Word, offset) | (this.get(Size.Word, offset + 2) << 16);
        }
    }

    set(s: Size, v: number, offset?: number) {
        offset = offset ?? 0;
        switch (s) {
            case Size.Bit:
                let b: boolean = v != 0;
                let r = this.mem8[Math.floor(offset / 8)].toString(2).padStart(8, '0').split('');
                r[7 - offset % 8] = b ? '1' : '0';
                this.mem8[Math.floor(offset / 8)] = parseInt(r.join(''), 2);
                break
            case Size.Byte:
                this.mem8[offset] = v;
                break
            case Size.Word:
                this.set(Size.Byte, v, offset + BL_INDEX);
                this.set(Size.Byte, v >> 8, offset + BH_INDEX);
                break
            case Size.DWord:
                this.set(Size.Word, v, offset);
                this.set(Size.Word, v >> 16, offset + 2);
                break
        }
    }

    bit(offset?: number, v?: number): number {
        if (v !== undefined) {
            this.set(Size.Bit, v, offset);
        }
        return this.get(Size.Bit, offset);
    }

    byte(offset?: number, v?: number): number {
        if (v !== undefined) {
            this.set(Size.Byte, v, offset);
        }
        return this.get(Size.Byte, offset);
    }

    word(offset?: number, v?: number): number {
        if (v !== undefined) {
            this.set(Size.Word, v, offset);
        }
        return this.get(Size.Word, offset);
    }

    dword(offset?: number, v?: number): number {
        if (v !== undefined) {
            this.set(Size.DWord, v, offset);
        }
        return this.get(Size.DWord, offset);
    }
}

enum SegNames { es = 0, cs, ss, ds, fs, gs};
let core: {
    opcode_index: number,
    cseip: number,
    base_ds: number,
    base_ss: number,
    base_val_ds: SegNames,
    rep_zero: boolean,
    prefixes: number,
    ea_table: VName<number>[]
} = {
    opcode_index: 0,
    cseip: 0,
    base_ds: 0,
    base_ss: 0,
    base_val_ds: SegNames.es,
    rep_zero: false,
    prefixes: 0,
    ea_table: []
};
let last_ea86_offset: number = 0;
const cpu_regs = {
    regs: [
        new Mem(1),
        new Mem(1),
        new Mem(1),
        new Mem(1),
        new Mem(1),
        new Mem(1),
        new Mem(1),
        new Mem(1),
    ],
    ip: new Mem(1),
    flags: new Mem(1),
};
let
    DW_INDEX: number,
    W_INDEX: number,
    BH_INDEX: number,
    BL_INDEX: number;
if (false) {
    DW_INDEX = 0
    W_INDEX = 1
    BH_INDEX = 2
    BL_INDEX = 3
} else {
    DW_INDEX = 0
    W_INDEX = 0
    BH_INDEX = 1
    BL_INDEX = 0
}
const REGI_AX = 0, REGI_CX = 1, REGI_DX = 2, REGI_BX = 3,
    REGI_SP = 4, REGI_BP = 5, REGI_SI = 6, REGI_DI = 7;


enum FLAG {
    CF = 0,
    PF = 2,
    AF = 4,
    ZF = 6,
    SF,
    TF,
    IF,
    DF,
    OF,
    IOPL,
    NT = 14,
    RF = 16,
    VM,
    AC,
    ID = 21
}

const FLAG_CF = 1 << FLAG.CF; //1
const FLAG_PF = 1 << FLAG.PF; //2
const FLAG_AF = 1 << FLAG.AF; //4
const FLAG_ZF = 1 << FLAG.ZF; //6
const FLAG_SF = 1 << FLAG.SF; //7
const FLAG_OF = 1 << FLAG.OF; //11

const FLAG_TF = 1 << FLAG.TF;  //8
const FLAG_IF = 1 << FLAG.IF;  //9
const FLAG_DF = 1 << FLAG.DF; //10

const FLAG_IOPL = (1 << FLAG.IOPL) | (1 << 13); //12, 13
const FLAG_NT = 1 << FLAG.NT; //14
const FLAG_RF = 1 << FLAG.RF; //16
const FLAG_VM = 1 << FLAG.VM; //17
const FLAG_AC = 1 << FLAG.AC; //18
const FLAG_ID = 1 << FLAG.ID; //21

const FMASK_TEST = (FLAG_CF | FLAG_PF | FLAG_AF | FLAG_ZF | FLAG_SF | FLAG_OF)
const FMASK_NORMAL = (FMASK_TEST | FLAG_DF | FLAG_TF | FLAG_IF)
const FMASK_ALL = (FMASK_NORMAL | FLAG_IOPL | FLAG_NT)

const reg = {
    get al() {
        return cpu_regs.regs[REGI_AX].get(Size.Byte, BL_INDEX);
    },
    set al(val) {
        cpu_regs.regs[REGI_AX].set(Size.Byte, val, BL_INDEX)
    },
    get s_al(): VName<number> {
        return {
            name() {
                return 'AL'
            },
            get() {
                return reg.al
            }, set(v: number) {
                reg.al = v;
            }
        }
    },
    get ah() {
        return cpu_regs.regs[REGI_AX].get(Size.Byte, BH_INDEX);
    },
    set ah(val) {
        cpu_regs.regs[REGI_AX].set(Size.Byte, val, BH_INDEX);
    },
    get s_ah(): VName<number> {
        return {
            name() {
                return 'AH'
            },
            get() {
                return reg.ah
            }, set(v: number) {
                reg.ah = v;
            }
        }
    },
    get ax() {
        return cpu_regs.regs[REGI_AX].get(Size.Word, W_INDEX);
    },
    set ax(val) {
        cpu_regs.regs[REGI_AX].set(Size.Word, val, W_INDEX);
    },
    get s_ax(): VName<number> {
        return {
            name() {
                return 'AX'
            }, get() {
                return reg.ax
            }, set(v: number) {
                reg.ax = v;
            }
        }
    },
    get eax() {
        return cpu_regs.regs[REGI_AX].get(Size.DWord, DW_INDEX);
    },
    set eax(val: number) {
        cpu_regs.regs[REGI_AX].set(Size.DWord, val, DW_INDEX);
    },
    get s_eax(): VName<number> {
        return {
            name() {
                return 'EAX'
            }
            , get() {
                return reg.eax
            }, set(v: number) {
                reg.eax = v;
            }
        }
    },
    get bl() {
        return cpu_regs.regs[REGI_BX].get(Size.Byte, BL_INDEX);
    },
    set bl(val) {
        cpu_regs.regs[REGI_BX].set(Size.Byte, val, BL_INDEX)
    },
    get s_bl(): VName<number> {
        return {
            name() {
                return 'BL'
            },
            get() {
                return reg.bl
            }, set(v: number) {
                reg.bl = v;
            }
        }
    },
    get bh() {
        return cpu_regs.regs[REGI_BX].get(Size.Byte, BH_INDEX);
    },
    set bh(val) {
        cpu_regs.regs[REGI_BX].set(Size.Byte, val, BH_INDEX);
    },
    get s_bh(): VName<number> {
        return {
            name() {
                return 'BH'
            }, get() {
                return reg.bh
            }, set(v: number) {
                reg.bh = v;
            }
        }
    },
    get bx() {
        return cpu_regs.regs[REGI_BX].get(Size.Word, W_INDEX);
    },
    set bx(val) {
        cpu_regs.regs[REGI_BX].set(Size.Word, val, W_INDEX);
    },
    get s_bx(): VName<number> {
        return {
            name() {
                return 'BX'
            }, get() {
                return reg.bx
            }, set(v: number) {
                reg.bx = v;
            }
        }
    },
    get ebx() {
        return cpu_regs.regs[REGI_BX].get(Size.DWord, DW_INDEX);
    },
    set ebx(val: number) {
        cpu_regs.regs[REGI_BX].set(Size.DWord, val, DW_INDEX);
    },
    get s_ebx(): VName<number> {
        return {
            name() {
                return 'EBX'
            }, get() {
                return reg.ebx
            }, set(v: number) {
                reg.ebx = v;
            }
        }
    },
    get cl() {
        return cpu_regs.regs[REGI_CX].get(Size.Byte, BL_INDEX);
    },
    set cl(val) {
        cpu_regs.regs[REGI_CX].set(Size.Byte, val, BL_INDEX)
    },
    get s_cl(): VName<number> {
        return {
            name() {
                return 'CL'
            }, get() {
                return reg.cl
            }, set(v: number) {
                reg.cl = v;
            }
        }
    },
    get ch() {
        return cpu_regs.regs[REGI_CX].get(Size.Byte, BH_INDEX);
    },
    set ch(val) {
        cpu_regs.regs[REGI_CX].set(Size.Byte, val, BH_INDEX);
    },
    get s_ch(): VName<number> {
        return {
            name() {
                return 'CH'
            }, get() {
                return reg.ch
            }, set(v: number) {
                reg.ch = v;
            }
        }
    },
    get cx() {
        return cpu_regs.regs[REGI_CX].get(Size.Word, W_INDEX);
    },
    set cx(val) {
        cpu_regs.regs[REGI_CX].set(Size.Word, val, W_INDEX);
    },
    get s_cx(): VName<number> {
        return {
            name() {
                return 'CX'
            }, get() {
                return reg.cx
            }, set(v: number) {
                reg.cx = v;
            }
        }
    },
    get ecx() {
        return cpu_regs.regs[REGI_CX].get(Size.DWord, DW_INDEX);
    },
    set ecx(val: number) {
        cpu_regs.regs[REGI_CX].set(Size.DWord, val, DW_INDEX);
    },
    get s_ecx(): VName<number> {
        return {
            name() {
                return 'ECX'
            }, get() {
                return reg.ecx
            }, set(v: number) {
                reg.ecx = v;
            }
        }
    },
    get dl() {
        return cpu_regs.regs[REGI_DX].get(Size.Byte, BL_INDEX);
    },
    set dl(val) {
        cpu_regs.regs[REGI_DX].set(Size.Byte, val, BL_INDEX)
    },
    get s_dl(): VName<number> {
        return {
            name() {
                return 'DL'
            }, get() {
                return reg.dl
            }, set(v: number) {
                reg.dl = v;
            }
        }
    },
    get dh() {
        return cpu_regs.regs[REGI_DX].get(Size.Byte, BH_INDEX);
    },
    set dh(val) {
        cpu_regs.regs[REGI_DX].set(Size.Byte, val, BH_INDEX);
    },
    get s_dh(): VName<number> {
        return {
            name() {
                return 'DH'
            }, get() {
                return reg.dh
            }, set(v: number) {
                reg.dh = v;
            }
        }
    },
    get dx() {
        return cpu_regs.regs[REGI_DX].get(Size.Word, W_INDEX);
    },
    set dx(val) {
        cpu_regs.regs[REGI_DX].set(Size.Word, val, W_INDEX);
    },
    get s_dx(): VName<number> {
        return {
            name() {
                return 'DX'
            }, get() {
                return reg.dx
            }, set(v: number) {
                reg.dx = v;
            }
        }
    },
    get edx() {
        return cpu_regs.regs[REGI_DX].get(Size.DWord, DW_INDEX);
    },
    set edx(val: number) {
        cpu_regs.regs[REGI_DX].set(Size.DWord, val, DW_INDEX);
    },
    get s_edx(): VName<number> {
        return {
            name() {
                return 'EDX'
            }, get() {
                return reg.edx
            }, set(v: number) {
                reg.edx = v;
            }
        }
    },

    get si() {
        return cpu_regs.regs[REGI_SI].get(Size.Word, W_INDEX);
    },
    get esi() {
        return cpu_regs.regs[REGI_SI].get(Size.DWord, DW_INDEX);
    },
    set si(v: number) {
        cpu_regs.regs[REGI_SI].set(Size.Word, v, W_INDEX);
    },
    set esi(v: number) {
        cpu_regs.regs[REGI_SI].set(Size.DWord, v, DW_INDEX);
    },
    get s_si(): VName<number> {
        return {
            name() {
                return 'SI'
            }, get() {
                return reg.si
            }, set(v: number) {
                reg.si = v;
            }
        }
    },
    get s_esi(): VName<number> {
        return {
            name() {
                return 'ESI'
            }, get() {
                return reg.esi
            }, set(v: number) {
                reg.esi = v;
            }
        }
    },

    get di() {
        return cpu_regs.regs[REGI_DI].get(Size.Word, W_INDEX);
    },
    get edi() {
        return cpu_regs.regs[REGI_DI].get(Size.DWord, DW_INDEX);
    },
    set di(v: number) {
        cpu_regs.regs[REGI_DI].set(Size.Word, v, W_INDEX);
    },
    set edi(v: number) {
        cpu_regs.regs[REGI_DI].set(Size.DWord, v, DW_INDEX);
    },
    get s_di(): VName<number> {
        return {
            name() {
                return 'DI'
            }, get() {
                return reg.di
            }, set(v: number) {
                reg.di = v;
            }
        }
    },
    get s_edi(): VName<number> {
        return {
            name() {
                return 'EDI'
            }, get() {
                return reg.edi
            }, set(v: number) {
                reg.edi = v;
            }
        }
    },

    get sp() {
        return cpu_regs.regs[REGI_SP].get(Size.Word, W_INDEX);
    },
    get esp() {
        return cpu_regs.regs[REGI_SP].get(Size.DWord, DW_INDEX);
    },
    set sp(v: number) {
        cpu_regs.regs[REGI_SP].set(Size.Word, v, W_INDEX);
    },
    set esp(v: number) {
        cpu_regs.regs[REGI_SP].set(Size.DWord, v, DW_INDEX);
    },
    get s_sp(): VName<number> {
        return {
            name() {
                return 'SP'
            }, get() {
                return reg.sp
            }, set(v: number) {
                reg.sp = v;
            }
        }
    },
    get s_esp(): VName<number> {
        return {
            name() {
                return 'ESP'
            }, get() {
                return reg.esp
            }, set(v: number) {
                reg.esp = v;
            }
        }
    },

    get bp() {
        return cpu_regs.regs[REGI_BP].get(Size.Word, W_INDEX);
    },
    get ebp() {
        return cpu_regs.regs[REGI_BP].get(Size.DWord, DW_INDEX);
    },
    set bp(v: number) {
        cpu_regs.regs[REGI_BP].set(Size.Word, v, W_INDEX);
    },
    set ebp(v: number) {
        cpu_regs.regs[REGI_BP].set(Size.DWord, v, DW_INDEX);
    },
    get s_bp(): VName<number> {
        return {
            name() {
                return 'BP'
            }, get() {
                return reg.bp
            }, set(v: number) {
                reg.bp = v;
            }
        }
    },
    get s_ebp(): VName<number> {
        return {
            name() {
                return 'EBP'
            }, get() {
                return reg.ebp
            }, set(v: number) {
                reg.ebp = v;
            }
        }
    },

    get ip() {
        return cpu_regs.ip.get(Size.Word, W_INDEX);
    },
    get eip() {
        return cpu_regs.ip.get(Size.DWord, DW_INDEX);
    },
    set ip(v: number) {
        cpu_regs.ip.set(Size.Word, v, W_INDEX);
    },
    set eip(v: number) {
        cpu_regs.ip.set(Size.DWord, v, DW_INDEX);
    },
    get s_ip(): VName<number> {
        return {
            name() {
                return 'IP'
            }, get() {
                return reg.ip
            }, set(v: number) {
                reg.ip = v;
            }
        }
    },
    get s_eip(): VName<number> {
        return {
            name() {
                return 'EIP'
            }, get() {
                return reg.eip
            }, set(v: number) {
                reg.eip = v;
            }
        }
    },

    get flags() {
        return cpu_regs.flags.get(Size.DWord);
    },
    set flags(v: number) {
        cpu_regs.flags.set(Size.DWord, v);
    },

    get s_flags(): VName<number> {
        return {
            name() {
                return 'FLAGS'
            }, get() {
                return reg.flags
            }, set(v: number) {
                reg.flags = v;
            }
        }
    },


    get CF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.CF);
    },
    get PF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.PF);
    },
    get AF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.AF);
    },
    get ZF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.ZF);
    },
    get SF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.SF);
    },
    get OF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.OF);
    },
    get TF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.TF);
    },
    get IF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.IF);
    },
    get DF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.DF);
    },
    get IOPL() {
        return cpu_regs.flags.get(Size.Bit, FLAG.IOPL) | cpu_regs.flags.get(Size.Bit, 13);
    },
    get NT() {
        return cpu_regs.flags.get(Size.Bit, FLAG.NT);
    },
    get RF() {
        return cpu_regs.flags.get(Size.Bit, FLAG.RF);
    },
    get VM() {
        return cpu_regs.flags.get(Size.Bit, FLAG.VM);
    },
    get AC() {
        return cpu_regs.flags.get(Size.Bit, FLAG.AC);
    },
    get ID() {
        return cpu_regs.flags.get(Size.Bit, FLAG.ID);
    },

    set CF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.CF);
    },
    set PF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.PF);
    },
    set AF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.AF);
    },
    set ZF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.ZF);
    },
    set SF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.SF);
    },
    set OF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.OF);
    },
    set TF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.TF);
    },
    set IF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.IF);
    },
    set DF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.DF);
    },
    set IOPL(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.IOPL)
        cpu_regs.flags.set(Size.Bit, v, 13);
    },
    set NT(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.NT);
    },
    set RF(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.RF);
    },
    set VM(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.VM);
    },
    set AC(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.AC);
    },
    set ID(v: number) {
        cpu_regs.flags.set(Size.Bit, v, FLAG.ID);
    },

}

function BaseDS() {
    return core.base_ds;
}

function BaseSS() {
    return core.base_ss;
}

let MemBase: Mem = new Mem(0x100000);

function FetchDiscardb() {
    core.cseip += 1;
}

function FetchPeekb(): number {
    let offset = core.cseip;
    return MemBase.get(Size.Byte, offset);
}

function Fetchb(change?: boolean) {
    let offset = core.cseip;
    let val = MemBase.get(Size.Byte, offset);
    if (change) core.cseip += 1;
    return val;
}

function Fetchbr(change?: boolean): VName<number> {
    return {
        get() {
            return Fetchb(change);
        },
        set() {
            throw new Error("It's Fetch");
        },
        name(): string {
            return Fetchb(false).toString(16).padStart(2, '0');
        }
    }
}

function Fetchw(change?: boolean) {
    let offset = core.cseip;
    if (change) core.cseip += 2;
    return MemBase.get(Size.Word, offset);
}

function Fetchwr(change?: boolean): VName<number> {
    return {
        get() {
            return Fetchw(change);
        },
        set() {
            throw new Error("It's Fetch");
        },
        name(): string {
            return Fetchw(false).toString(16).padStart(4, '0');
        }
    }
}

function Fetchd(change?: boolean) {
    let offset = core.cseip;
    if (change) core.cseip += 4;
    return MemBase.get(Size.DWord, offset);
}

function Fetchdr(change?: boolean): VName<number> {
    return {
        get() {
            return Fetchd(change);
        },
        set() {
            throw new Error("It's Fetch");
        },
        name(): string {
            return Fetchd(false).toString(16).padStart(8, '0');
        }
    }
}

function Fetchbs(change?: boolean) {
    return Fetchb(change);
}

function Fetchws(change?: boolean) {
    return Fetchw(change);
}

function Fetchds(change?: boolean) {
    return Fetchd(change);
}

type VName<T> = {
    get(changeIp?: boolean): T,
    set(v: T): void,
    name(): string
}


/* The MOD/RM Decoder for EA for this decoder's addressing modes */
const EA_none: VName<number> = {
    name() {
        return "NONE"
    }, get() {
        throw new Error("NULL")
    }, set(v) {
        throw new Error("NULL")
    }
};
const EA_16_00_n: VName<number> = {
    get() {
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.si)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[BX + SI]`
    }
};
const EA_16_01_n: VName<number> = {
    get() {
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.di)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[BX + DI]`
    }
}
const EA_16_02_n: VName<number> = {
    get() {
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.si)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[BP + SI]`
    }
}
const EA_16_03_n: VName<number> = {
    get() {
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.di)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[BP + DI]`
    }
}
const EA_16_04_n: VName<number> = {

    get() {
        return BaseDS() + (last_ea86_offset = ((reg.si)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[SI]`
    }
}
const EA_16_05_n: VName<number> = {
    get() {
        return BaseDS() + (last_ea86_offset = ((reg.di)))
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return `[DI]`
    }
}
const EA_16_06_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((Fetchw(change))));
    },
    set(v) {
        throw new Error("NULL")
    }, name() {
        return "[" + Fetchw().toString(16).padStart(4, '0') + "]"
    }
}
const EA_16_07_n: VName<number> = {
    get() {
        return BaseDS() + (last_ea86_offset = ((reg.bx)));
    }
    ,
    set(v) {
        throw new Error("NULL")
    }
    ,
    name() {
        return "[BX]"
    }
}

const EA_16_40_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.si + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX + SI + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }

}
const EA_16_41_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.di + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX + DI + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_42_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.si + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP + SI " + MemBase.get(Size.Byte, core.cseip).toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_43_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.di + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP  + DI" + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_44_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.si + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[SI  + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_45_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.di + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[DI  + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_46_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + Fetchbs(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP  + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}
const EA_16_47_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx + Fetchbs(change))));
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX  + " + Fetchb().toString(16).padStart(2, '0') + ']'
    }
}

const EA_16_80_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.si + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX + SI + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_81_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx + reg.di + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX + DI + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_82_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.si + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP + SI " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_83_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + reg.di + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP  + DI" + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_84_n: VName<number> = {

    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.si + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[SI  + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }

}
const EA_16_85_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.di + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[DI  + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_86_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseSS() + (last_ea86_offset = ((reg.bp + Fetchws(change))))
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BP  + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}
const EA_16_87_n: VName<number> = {
    get(change?: boolean) {
        if (change == undefined) change = true;
        return BaseDS() + (last_ea86_offset = ((reg.bx) + Fetchws(change)));
    },
    set(v) {
        throw new Error("NULL")
    },
    name() {
        return "[BX  + " + Fetchw().toString(16).padStart(4, '0') + ']'
    }
}


const EATable: VName<number>[] = [
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    EA_16_00_n, EA_16_01_n, EA_16_02_n, EA_16_03_n, EA_16_04_n, EA_16_05_n, EA_16_06_n, EA_16_07_n,
    /* 01 */
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    EA_16_40_n, EA_16_41_n, EA_16_42_n, EA_16_43_n, EA_16_44_n, EA_16_45_n, EA_16_46_n, EA_16_47_n,
    /* 10 */
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    EA_16_80_n, EA_16_81_n, EA_16_82_n, EA_16_83_n, EA_16_84_n, EA_16_85_n, EA_16_86_n, EA_16_87_n,
    /* 11 These are illegal so make em EA_none */
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    /* 00 */
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    /* 01 */
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    /* 10 */
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    /* 11 These are illegal so make em 0 */
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none,
    EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none, EA_none

];


enum CBRET {
    NONE = 0, STOP = 1
}

type Segment = {
    val: number
    phys: number						/* The physical address start in emulated machine */
    limit: number
    expanddown: boolean
};
type Segments = {
    es: Segment,
    cs: Segment,
    ss: Segment,
    ds: Segment,
    fs: Segment,
    gs: Segment
};
const segs: Segments = {
    es: {val: 0, phys: 0, limit: 0, expanddown: false},
    cs: {val: 0, phys: 0, limit: 0, expanddown: false},
    ss: {val: 0, phys: 0, limit: 0, expanddown: false},
    ds: {val: 0, phys: 0, limit: 0, expanddown: false},
    fs: {val: 0, phys: 0, limit: 0, expanddown: false},
    gs: {val: 0, phys: 0, limit: 0, expanddown: false},
}

function Seg(index: SegNames) {
    switch (index) {
        case SegNames.es:
            return segs.es;
        case SegNames.cs:
            return segs.cs;
        case SegNames.ss:
            return segs.ss;
        case SegNames.ds:
            return segs.ds;
        case SegNames.fs:
            return segs.fs;
        case SegNames.gs:
            return segs.gs;
    }
}

function SegPhys(index: SegNames) {
    switch (index) {
        case SegNames.es:
            return segs.es.phys;
        case SegNames.cs:
            return segs.cs.phys;
        case SegNames.ss:
            return segs.ss.phys;
        case SegNames.ds:
            return segs.ds.phys;
        case SegNames.fs:
            return segs.fs.phys;
        case SegNames.gs:
            return segs.gs.phys;
    }
}

function SegValue(index: SegNames) {
    switch (index) {
        case SegNames.es:
            return segs.es.val;
        case SegNames.cs:
            return segs.cs.val;
        case SegNames.ss:
            return segs.ss.val;
        case SegNames.ds:
            return segs.ds.val;
        case SegNames.fs:
            return segs.fs.val;
        case SegNames.gs:
            return segs.gs.val;
    }
}

enum TypeFlag {
    t_UNKNOWN = 0,
    t_ADDb, t_ADDw, t_ADDd,
    t_ORb, t_ORw, t_ORd,
    t_ADCb, t_ADCw, t_ADCd,
    t_SBBb, t_SBBw, t_SBBd,
    t_ANDb, t_ANDw, t_ANDd,
    t_SUBb, t_SUBw, t_SUBd,
    t_XORb, t_XORw, t_XORd,
    t_CMPb, t_CMPw, t_CMPd,
    t_INCb, t_INCw, t_INCd,
    t_DECb, t_DECw, t_DECd,
    t_TESTb, t_TESTw, t_TESTd,
    t_SHLb, t_SHLw, t_SHLd,
    t_SHRb, t_SHRw, t_SHRd,
    t_SARb, t_SARw, t_SARd,
    t_ROLb, t_ROLw, t_ROLd,
    t_RORb, t_RORw, t_RORd,
    t_RCLb, t_RCLw, t_RCLd,
    t_RCRb, t_RCRw, t_RCRd,
    t_NEGb, t_NEGw, t_NEGd,

    t_DSHLw, t_DSHLd,
    t_DSHRw, t_DSHRd,
    t_MUL, t_DIV,
    t_NOTDONE,
    t_LASTFLAG
}

type LazyFlags = {
    var1: Mem, var2: Mem, res: Mem;
    type: TypeFlag,
    prev_type: TypeFlag,
    oldcf: number;
}


function SETFLAGBIT(TYPE: number, TEST: boolean) {
    if (TEST)
        reg.flags |= TYPE;
    else
        reg.flags &= ~TYPE;
}

const lflags: LazyFlags = {
    var1: new Mem(1),
    var2: new Mem(1),
    res: new Mem(1),
    type: TypeFlag.t_UNKNOWN,
    prev_type: TypeFlag.t_UNKNOWN,
    oldcf: 0
}

function lf_var1b() {
    return {
        get() {
            return lflags.var1.byte(BL_INDEX);
        },
        set(n: number) {
            lflags.var1.byte(BL_INDEX, n);
        }
    }
}

function lf_var2b() {
    return {
        get() {
            return lflags.var2.byte(BL_INDEX);
        },
        set(n: number) {
            lflags.var2.byte(BL_INDEX, n);
        }
    }
}

function lf_resb() {
    return {
        get() {
            return lflags.res.byte(BL_INDEX);
        },
        set(n: number) {
            lflags.res.byte(BL_INDEX, n);
        }
    }
}

function lf_var1w() {
    return {
        get() {
            return lflags.var1.word(W_INDEX);
        },
        set(n: number) {
            lflags.var1.word(W_INDEX, n);
        }
    }
}

function lf_var2w() {
    return {
        get() {
            return lflags.var2.word(W_INDEX);
        },
        set(n: number) {
            lflags.var2.word(W_INDEX, n);
        }
    }
}

function lf_resw() {
    return {
        get() {
            return lflags.res.word(W_INDEX);
        },
        set(n: number) {
            lflags.res.word(W_INDEX, n);
        }
    }
}

function lf_var1d() {
    return {
        get() {
            return lflags.var1.dword(DW_INDEX);
        },
        set(n: number) {
            lflags.var1.dword(DW_INDEX, n);
        }
    }
}

function lf_var2d() {
    return {
        get() {
            return lflags.var2.dword(DW_INDEX);
        },
        set(n: number) {
            lflags.var2.dword(DW_INDEX, n);
        }
    }
}

function lf_resd() {
    return {
        get() {
            return lflags.res.dword(DW_INDEX);
        },
        set(n: number) {
            lflags.res.dword(DW_INDEX, n);
        }
    }
}

function SET_FLAG(fl: number, b: boolean | number) {
    if (b)
        reg.flags |= fl;
    else
        reg.flags &= fl;
}

function DOFLAG_AF() {
    reg.flags = (reg.flags & ~FLAG_AF) | (((lf_var1b().get() ^ lf_var2b().get()) ^ lf_resb().get()) & 0x10);
}

let parity_lookup = [
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0,
    FLAG_PF, 0, 0, FLAG_PF, 0, FLAG_PF, FLAG_PF, 0, 0, FLAG_PF, FLAG_PF, 0, FLAG_PF, 0, 0, FLAG_PF

];

function DOFLAG_PF() {
    reg.flags = (reg.flags & ~FLAG_PF) | parity_lookup[lf_resb().get()];
}

function DOFLAG_ZFb() {
    SETFLAGBIT(FLAG_ZF, lf_resb().get() == 0);
}

function DOFLAG_SFb() {
    reg.flags = (reg.flags & ~FLAG_SF) | ((lf_resb().get() & 0x80) >> 0);
}

function DOFLAG_ZFw() {
    SETFLAGBIT(FLAG_ZF, lf_resw().get() == 0);
}

function DOFLAG_SFw() {
    reg.flags = (reg.flags & ~FLAG_SF) | ((lf_resw().get() & 0x8000) >> 8);
}

function DOFLAG_ZFd() {
    SETFLAGBIT(FLAG_ZF, lf_resd().get() == 0);
}

function DOFLAG_SFd() {
    reg.flags = (reg.flags & ~FLAG_SF) | ((lf_resw().get() & 0x80000000) >> 24);
}


function FillFlags() {
    switch (lflags.type) {
        case TypeFlag.t_UNKNOWN:
            break;
        case TypeFlag.t_ADDb:
            SET_FLAG(FLAG_CF, (lf_resb().get() < lf_var1b().get()));
            DOFLAG_AF();
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, ((lf_var1b().get() ^ lf_var2b().get() ^ 0x80) & (lf_resb().get() ^ lf_var1b().get())) & 0x80);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ADDw:
            SET_FLAG(FLAG_CF, (lf_resw().get() < lf_var1w().get()));
            DOFLAG_AF();
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, ((lf_var1w().get() ^ lf_var2w().get() ^ 0x8000) & (lf_resw().get() ^ lf_var1w().get())) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ADDd:
            SET_FLAG(FLAG_CF, (lf_resd().get() < lf_var1d().get()));
            DOFLAG_AF();
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, ((lf_var1d().get() ^ lf_var2d().get() ^ 0x80000000) & (lf_resd().get() ^ lf_var1d().get())) & 0x80000000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ADCb:
            SET_FLAG(FLAG_CF, (lf_resb().get() < lf_var1b().get()) || (lflags.oldcf && (lf_resb().get() == lf_var1b().get())));
            DOFLAG_AF();
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, ((lf_var1b().get() ^ lf_var2b().get() ^ 0x80) & (lf_resb().get() ^ lf_var1b().get())) & 0x80);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ADCw:
            SET_FLAG(FLAG_CF, (lf_resw().get() < lf_var1w().get()) || (lflags.oldcf && (lf_resw().get() == lf_var1w().get())));
            DOFLAG_AF();
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, ((lf_var1w().get() ^ lf_var2w().get() ^ 0x8000) & (lf_resw().get() ^ lf_var1w().get())) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ADCd:
            SET_FLAG(FLAG_CF, (lf_resd().get() < lf_var1d().get()) || (lflags.oldcf && (lf_resd().get() == lf_var1d().get())));
            DOFLAG_AF();
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, ((lf_var1d().get() ^ lf_var2d().get() ^ 0x80000000) & (lf_resd().get() ^ lf_var1d().get())) & 0x80000000);
            DOFLAG_PF();
            break;


        case TypeFlag.t_SBBb:
            SET_FLAG(FLAG_CF, (lf_var1b().get() < lf_resb().get()) || (lflags.oldcf && (lf_var2b().get() == 0xff)));
            DOFLAG_AF();
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_var1b().get() ^ lf_var2b().get()) & (lf_var1b().get() ^ lf_resb().get()) & 0x80);
            DOFLAG_PF();
            break;
        case TypeFlag.t_SBBw:
            SET_FLAG(FLAG_CF, (lf_var1w().get() < lf_resw().get()) || (lflags.oldcf && (lf_var2w().get() == 0xffff)));
            DOFLAG_AF();
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_var1w().get() ^ lf_var2w().get()) & (lf_var1w().get() ^ lf_resw().get()) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_SBBd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() < lf_resd().get()) || (lflags.oldcf && (lf_var2d().get() == 0xffffffff)));
            DOFLAG_AF();
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_var1d().get() ^ lf_var2d().get()) & (lf_var1d().get() ^ lf_resd().get()) & 0x80000000);
            DOFLAG_PF();
            break;


        case TypeFlag.t_SUBb:
        case TypeFlag.t_CMPb:
            SET_FLAG(FLAG_CF, (lf_var1b().get() < lf_var2b().get()));
            DOFLAG_AF();
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_var1b().get() ^ lf_var2b().get()) & (lf_var1b().get() ^ lf_resb().get()) & 0x80);
            DOFLAG_PF();
            break;
        case TypeFlag.t_SUBw:
        case TypeFlag.t_CMPw:
            SET_FLAG(FLAG_CF, (lf_var1w().get() < lf_var2w().get()));
            DOFLAG_AF();
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_var1w().get() ^ lf_var2w().get()) & (lf_var1w().get() ^ lf_resw().get()) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_SUBd:
        case TypeFlag.t_CMPd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() < lf_var2d().get()));
            DOFLAG_AF();
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_var1d().get() ^ lf_var2d().get()) & (lf_var1d().get() ^ lf_resd().get()) & 0x80000000);
            DOFLAG_PF();
            break;


        case TypeFlag.t_ORb:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ORw:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_ORd:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;


        case TypeFlag.t_TESTb:
        case TypeFlag.t_ANDb:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_TESTw:
        case TypeFlag.t_ANDw:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_TESTd:
        case TypeFlag.t_ANDd:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;


        case TypeFlag.t_XORb:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_XORw:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;
        case TypeFlag.t_XORd:
            SET_FLAG(FLAG_CF, false);
            SET_FLAG(FLAG_AF, false);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            break;


        case TypeFlag.t_SHLb:
            if (lf_var2b().get() > 8) SET_FLAG(FLAG_CF, false);
            else SET_FLAG(FLAG_CF, (lf_var1b().get() >> (8 - lf_var2b().get())) & 1);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_resb().get() >> 7) ^ reg.CF); /* MSB of result XOR CF. WARNING: This only works because FLAGS_CF == 1 */
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2b().get() & 0x1f));
            break;
        case TypeFlag.t_SHLw:
            if (lf_var2b().get() > 16) SET_FLAG(FLAG_CF, false);
            else SET_FLAG(FLAG_CF, (lf_var1w().get() >> (16 - lf_var2b().get())) & 1);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_resw().get() >> 15) ^ reg.CF); /* MSB of result XOR CF. WARNING: This only works because FLAGS_CF == 1 */
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2w().get() & 0x1f));
            break;
        case TypeFlag.t_SHLd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (32 - lf_var2b().get())) & 1);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_resd().get() >> 31) ^ reg.CF); /* MSB of result XOR CF. WARNING: This only works because FLAGS_CF == 1 */
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2d().get() & 0x1f));
            break;


        case TypeFlag.t_DSHLw:
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (32 - lf_var2b().get())) & 1);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_resw().get() ^ lf_var1w().get()) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_DSHLd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (32 - lf_var2b().get())) & 1);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_resd().get() ^ lf_var1d().get()) & 0x80000000);
            DOFLAG_PF();
            break;


        case TypeFlag.t_SHRb:
            SET_FLAG(FLAG_CF, (lf_var1b().get() >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            if ((lf_var2b().get() & 0x1f) == 1) SET_FLAG(FLAG_OF, (lf_var1b().get() >= 0x80));
            else SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2b().get() & 0x1f));
            break;
        case TypeFlag.t_SHRw:
            SET_FLAG(FLAG_CF, (lf_var1w().get() >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            if ((lf_var2w().get() & 0x1f) == 1) SET_FLAG(FLAG_OF, (lf_var1w().get() >= 0x8000));
            else SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2w().get() & 0x1f));
            break;
        case TypeFlag.t_SHRd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            if ((lf_var2d().get() & 0x1f) == 1) SET_FLAG(FLAG_OF, (lf_var1d().get() >= 0x80000000));
            else SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2d().get() & 0x1f));
            break;


        case TypeFlag.t_DSHRw:	/* Hmm this is not correct for shift higher than 16 */
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_resw().get() ^ lf_var1w().get()) & 0x8000);
            DOFLAG_PF();
            break;
        case TypeFlag.t_DSHRd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_resd().get() ^ lf_var1d().get()) & 0x80000000);
            DOFLAG_PF();
            break;


        case TypeFlag.t_SARb:
            SET_FLAG(FLAG_CF, ((lf_var1b().get()) >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2b().get() & 0x1f));
            break;
        case TypeFlag.t_SARw:
            SET_FLAG(FLAG_CF, ((lf_var1w().get()) >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2w().get() & 0x1f));
            break;
        case TypeFlag.t_SARd:
            SET_FLAG(FLAG_CF, ((lf_var1d().get()) >> (lf_var2b().get() - 1)) & 1);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, false);
            DOFLAG_PF();
            SET_FLAG(FLAG_AF, (lf_var2d().get() & 0x1f));
            break;

        case TypeFlag.t_INCb:
            SET_FLAG(FLAG_AF, (lf_resb().get() & 0x0f) == 0);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_resb().get() == 0x80));
            DOFLAG_PF();
            break;
        case TypeFlag.t_INCw:
            SET_FLAG(FLAG_AF, (lf_resw().get() & 0x0f) == 0);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_resw().get() == 0x8000));
            DOFLAG_PF();
            break;
        case TypeFlag.t_INCd:
            SET_FLAG(FLAG_AF, (lf_resd().get() & 0x0f) == 0);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_resd().get() == 0x80000000));
            DOFLAG_PF();
            break;

        case TypeFlag.t_DECb:
            SET_FLAG(FLAG_AF, (lf_resb().get() & 0x0f) == 0x0f);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_resb().get() == 0x7f));
            DOFLAG_PF();
            break;
        case TypeFlag.t_DECw:
            SET_FLAG(FLAG_AF, (lf_resw().get() & 0x0f) == 0x0f);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_resw().get() == 0x7fff));
            DOFLAG_PF();
            break;
        case TypeFlag.t_DECd:
            SET_FLAG(FLAG_AF, (lf_resd().get() & 0x0f) == 0x0f);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_resd().get() == 0x7fffffff));
            DOFLAG_PF();
            break;

        case TypeFlag.t_NEGb:
            SET_FLAG(FLAG_CF, (lf_var1b().get() != 0));
            SET_FLAG(FLAG_AF, (lf_resb().get() & 0x0f) != 0);
            DOFLAG_ZFb();
            DOFLAG_SFb();
            SET_FLAG(FLAG_OF, (lf_var1b().get() == 0x80));
            DOFLAG_PF();
            break;
        case TypeFlag.t_NEGw:
            SET_FLAG(FLAG_CF, (lf_var1w().get() != 0));
            SET_FLAG(FLAG_AF, (lf_resw().get() & 0x0f) != 0);
            DOFLAG_ZFw();
            DOFLAG_SFw();
            SET_FLAG(FLAG_OF, (lf_var1w().get() == 0x8000));
            DOFLAG_PF();
            break;
        case TypeFlag.t_NEGd:
            SET_FLAG(FLAG_CF, (lf_var1d().get() != 0));
            SET_FLAG(FLAG_AF, (lf_resd().get() & 0x0f) != 0);
            DOFLAG_ZFd();
            DOFLAG_SFd();
            SET_FLAG(FLAG_OF, (lf_var1d().get() == 0x80000000));
            DOFLAG_PF();
            break;


        case TypeFlag.t_DIV:
        case TypeFlag.t_MUL:
            break;

        default:
            console.log("Unhandled flag type " + lflags.type);
            return 0;
    }
    lflags.type = TypeFlag.t_UNKNOWN;
    return cpu_regs.flags;
}

let CPU_Cycles = 0;


function status() {
    let str =
        "┌─────┬─────┬─────┬─────┬────┬────┬────┬────┬────┬────┬────┬────┬─────────────────┬────┐\n";
    str += "│ AX  │ BX  │ CX  │ DX  │    │    │    │    │    │    │    │    │      FLAGS      │    │\n"
    str += "├──┬──┼──┬──┼──┬──┼──┬──┤ SI │ DI │ BP │ SP │ DS │ ES │ SS │ CS ├─┬─┬─┬─┬─┬─┬─┬─┬─┤ IP │\n"
    str += "│AH│AL│BH│BL│CH│CL│DH│DL│    │    │    │    │    │    │    │    │C│Z│S│O│P│A│I│D│T│    │\n"
    str += "├──┼──┼──┼──┼──┼──┼──┼──┼────┼────┼────┼────┼────┼────┼────┼────┼─┼─┼─┼─┼─┼─┼─┼─┼─┼────┤\n"
    str += "│" + reg.ah.toString(16).padStart(2, '0') + "│" + reg.al.toString(16).padStart(2, '0') + ""
    str += "│" + reg.bh.toString(16).padStart(2, '0') + "│" + reg.bl.toString(16).padStart(2, '0') + ""
    str += "│" + reg.ch.toString(16).padStart(2, '0') + "│" + reg.cl.toString(16).padStart(2, '0') + ""
    str += "│" + reg.dh.toString(16).padStart(2, '0') + "│" + reg.dl.toString(16).padStart(2, '0') + ""
    str += "│" + reg.si.toString(16).padStart(4, '0') + ""
    str += "│" + reg.di.toString(16).padStart(4, '0') + ""
    str += "│" + reg.bp.toString(16).padStart(4, '0') + ""
    str += "│" + reg.sp.toString(16).padStart(4, '0') + ""
    str += "│" + segs.ds.val.toString(16).padStart(4, '0') + ""
    str += "│" + segs.es.val.toString(16).padStart(4, '0') + ""
    str += "│" + segs.ss.val.toString(16).padStart(4, '0') + ""
    str += "│" + segs.cs.val.toString(16).padStart(4, '0') + ""
    str += "|" + (reg.flags & FLAG_CF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_ZF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_SF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_OF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_PF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_AF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_IF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_DF ? "1" : "0");
    str += "|" + (reg.flags & FLAG_TF ? "1" : "0");
    str += "│" + reg.ip.toString(16).padStart(4, '0') + ""
    str += "│\n";
    str += "└──┴──┴──┴──┴──┴──┴──┴──┴────┴────┴────┴────┴────┴────┴────┴────┴─┴─┴─┴─┴─┴─┴─┴─┴─┴────┘\n"
    return str;
}


const nullptr: VName<number> = {
    name() {
        return 'NULL'
    }, get() {
        throw Error("Null");
    }, set(v: number) {
        throw Error("Null");
    }
}
const lookupRMregb = [
    reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al,
    reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl,
    reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl,
    reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl,
    reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah,
    reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch,
    reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh,
    reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh,

    reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al,
    reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl,
    reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl,
    reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl,
    reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah,
    reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch,
    reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh,
    reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh,

    reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al,
    reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl,
    reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl,
    reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl,
    reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah,
    reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch,
    reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh,
    reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh,

    reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al, reg.s_al,
    reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl, reg.s_cl,
    reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl, reg.s_dl,
    reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl, reg.s_bl,
    reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah, reg.s_ah,
    reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch, reg.s_ch,
    reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh, reg.s_dh,
    reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh, reg.s_bh
]
const lookupRMregw = [
    reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax,
    reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx,
    reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx,
    reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx,
    reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp,
    reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp,
    reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si,
    reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di,

    reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax,
    reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx,
    reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx,
    reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx,
    reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp,
    reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp,
    reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si,
    reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di,

    reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax,
    reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx,
    reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx,
    reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx,
    reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp,
    reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp,
    reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si,
    reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di,

    reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax, reg.s_ax,
    reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx, reg.s_cx,
    reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx, reg.s_dx,
    reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx, reg.s_bx,
    reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp, reg.s_sp,
    reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp, reg.s_bp,
    reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si, reg.s_si,
    reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di, reg.s_di
];
const lookupRMregd = [
    reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax,
    reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx,
    reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx,
    reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx,
    reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp,
    reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp,
    reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi,
    reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi,

    reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax,
    reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx,
    reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx,
    reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx,
    reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp,
    reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp,
    reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi,
    reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi,

    reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax,
    reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx,
    reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx,
    reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx,
    reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp,
    reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp,
    reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi,
    reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi,

    reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax, reg.s_eax,
    reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx, reg.s_ecx,
    reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx, reg.s_edx,
    reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx, reg.s_ebx,
    reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp, reg.s_esp,
    reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp, reg.s_ebp,
    reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi, reg.s_esi,
    reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi, reg.s_edi
];
const lookupRMEAregb = [
    /* 24 lines of 8*nullptr should give nice errors when used */
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh,
    reg.s_al, reg.s_cl, reg.s_dl, reg.s_bl, reg.s_ah, reg.s_ch, reg.s_dh, reg.s_bh
];
const lookupRMEAregw = [
    /* 24 lines of 8*nullptr should give nice errors when used */
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di,
    reg.s_ax, reg.s_cx, reg.s_dx, reg.s_bx, reg.s_sp, reg.s_bp, reg.s_si, reg.s_di
];
const lookupRMEAregd = [
    /* 24 lines of 8*nullptr should give nice errors when used */
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi,
    reg.s_eax, reg.s_ecx, reg.s_edx, reg.s_ebx, reg.s_esp, reg.s_ebp, reg.s_esi, reg.s_edi
];

function GetRM() {
    return Fetchb(true);
}

function GetEAa(rm: number): VName<number> {

    return core.ea_table[rm];
}

function Getrb(rm: number) {
    return lookupRMregb[rm];
}

function Getrw(rm: number) {
    return lookupRMregw[rm];
}

function Getrd(rm: number) {
    return lookupRMregd[rm];
}

function GetRMrb() {
    let rm = GetRM();
    return {rm, rb: Getrb(rm)}
}

function GetRMrw() {
    let rm = GetRM();
    return {rm, rw: Getrw(rm)}
}

function GetRMrd() {
    let rm = GetRM();
    return {rm, rd: Getrw(rm)}
}

function GetEArb(rm: number): VName<number> {
    return lookupRMEAregb[rm];
}

function GetEArw(rm: number) {
    return lookupRMEAregw[rm];
}

function GetEArd(rm: number) {
    return lookupRMEAregd[rm];
}

function LoadRb(vname: VName<number>) {
    return vname.get();
}

function LoadRw(vname: VName<number>) {
    return vname.get();
}

function LoadRd(vname: VName<number>) {
    return vname.get();
}

function LoadMb(vname: VName<number>) {
    return MemBase.byte(vname.get())
}

function LoadMw(vname: VName<number>) {
    return MemBase.word(vname.get())
}

function LoadMd(vname: VName<number>) {
    return MemBase.dword(vname.get())
}

function LoadMbr(vname: VName<number>): VName<number> {
    return {
        get() {
            return MemBase.byte(vname.get());
        },
        set(v: number) {
            MemBase.byte(vname.get(), v);
        },
        name() {
            return vname.name()
        }
    }

}

function LoadMwr(vname: VName<number>): VName<number> {
    return {
        get() {
            return MemBase.word(vname.get());
        },
        set(v: number) {
            MemBase.word(vname.get(), v);
        },
        name() {
            return vname.name()
        }
    }
}

function LoadMdr(vname: VName<number>): VName<number> {
    return {
        get() {
            return MemBase.dword(vname.get());
        },
        set(v: number) {
            MemBase.dword(vname.get(), v);
        },
        name() {
            return vname.name();
        }
    }
}


function SaveRb(vname: VName<number>, v: number) {
    vname.set(v);
}

function SaveRw(vname: VName<number>, v: number) {
    vname.set(v);
}

function SaveRd(vname: VName<number>, v: number) {
    vname.set(v);
}

function SaveMb(vname: VName<number>, v: number) {
    MemBase.set(Size.Byte, v, vname.get(false));
}

function SaveMw(vname: VName<number>, v: number) {
    MemBase.set(Size.Word, v, vname.get(false));
}

function SaveMd(vname: VName<number>, v: number) {
    MemBase.set(Size.DWord, v, vname.get(false));
}


function RMEbGb(inst: Function): string {
    const {rm, rb} = GetRMrb();
    if (rm >= 0xC0) {
        let earb = GetEArb(rm);
        return inst(earb, rb, LoadRb, SaveRb);
    } else {
        let eaa = GetEAa(rm);
        return inst(eaa, rb, LoadMb, SaveMb);
    }
}

function RMGbEb(inst: Function): string {
    let rmrb = GetRMrb();
    if (rmrb.rm >= 0xC0) {
        let earb = GetEArb(rmrb.rm);
        return inst(rmrb.rb, earb, LoadRb, SaveRb);
    } else {
        let eaa = GetEAa(rmrb.rm);
        let mb = LoadMbr(eaa);
        return inst(rmrb.rb, mb, LoadRb, SaveRb);
    }
}


function RMEwGw(inst: Function): string {
    let rmrw = GetRMrw();
    if (rmrw.rm >= 0xC0) {
        let earw = GetEArw(rmrw.rm);
        return inst(earw, rmrw.rw, LoadRw, SaveRw);
    } else {
        let eaa = GetEAa(rmrw.rm);
        return inst(eaa, rmrw.rw, LoadMw, SaveMw);
    }
}

function RMGwEw(inst: Function): string {
    let rmrw = GetRMrw();
    if (rmrw.rm >= 0xC0) {
        let earw = GetEArw(rmrw.rm);

        return inst(rmrw.rw, earw, LoadRw, SaveRw);
    } else {
        let eaa = GetEAa(rmrw.rm);
        let mw = LoadMwr(eaa);
        return inst(rmrw.rw, mw, LoadRw, SaveRw);
    }
}

function ALIb(inst: Function): string {
    let val = Fetchbr(true);
    return inst(reg.s_al, val, LoadRb, SaveRb);
}

function AXIw(inst: Function): string {
    let val = Fetchwr(true);
    return inst(reg.s_ax, val, LoadRw, SaveRw);
}

function Push_16(v: number): string {
    return CPU_Push16(v);
}

function Pop_16(): number {
    return CPU_Pop16();
}

let mask = 0xFFFF;
let notmask = 0xFFFF0000;
let use32: boolean = false;
let big = false;

function CPU_Push16(v: number,): string {

    let new_esp = (reg.esp & notmask) | (reg.esp - 2) & mask;
    MemBase.set(Size.Word, v, SegValue(SegNames.ss) + new_esp & mask)
    reg.esp = new_esp;
    return "PUSH";
}

function CPU_Pop16(...arg: any[]): number {
    let val = MemBase.get(SegValue(SegNames.ss) + (reg.esp & mask));
    reg.esp = (reg.esp & notmask) | ((reg.esp + 2) & mask);
    return val;
}

function CPU_PopSeg(seg: SegNames, use: boolean): any {
    let val = MemBase.word(SegValue(SegNames.ss) + (reg.esp & mask));
    let addsp = use32 ? 0x04 : 0x02;
    //Calculate this beforehand since the stack mask might change
    let new_esp = (reg.esp & notmask) | ((reg.esp + addsp) & mask);
    if (CPU_SetSegGeneral(seg, val)) return true;
    reg.esp = new_esp;
    return false;
}


function CPU_SetSegGeneral(seg: SegNames, value: number): boolean {
    const Segs = Seg(seg);
    Segs.val = value;
    Segs.phys = value << 4;
    if (seg == SegNames.ss) {
        big = false;
        mask = 0xffff;
        notmask = 0xffff0000;
    }

    /* real mode: loads do not change the limit. "Flat real mode" would not be possible otherwise.
     * vm86: loads are fixed at 64KB (right?) */
    if (reg.flags & FLAG_VM)
        Segs.limit = 0xFFFF;

    return false;
}

function SegBase(seg: SegNames) {
    return SegPhys(seg);
}


function GETIP() {
    return core.cseip - SegBase(SegNames.cs);
}

function SAVEIP() {
    reg.eip = GETIP();
}

function RUNEXCEPTION() {
    throw new Error("RUNEXCEPTION");
}

function ADDB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() + v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ADDb;
    return "ADD " + op1?.name() + ", " + op2?.name();
}

function ADCB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    lflags.oldcf = reg.CF ? 1 : 0;
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() + v2.get() + lflags.oldcf);
    save(op1, res.get());
    lflags.type = TypeFlag.t_ADCb;
    return "ADC " + op1?.name() + ", " + op2?.name();
}

function SBBB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    lflags.oldcf = reg.CF ? 1 : 0;
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - (v2.get() + lflags.oldcf));
    save(op1, res.get());
    lflags.type = TypeFlag.t_SBBb;
    return "SBB " + op1?.name() + ", " + op2?.name();
}

function SUBB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_SUBb;
    return "SUB " + op1?.name() + ", " + op2?.name();
}

function ORB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() | v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ORb;
    return "OR " + op1?.name() + ", " + op2?.name();
}

function XORB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() ^ v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_XORb;
    return "XOR " + op1?.name() + ", " + op2?.name();
}

function ANDB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() & v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ANDb;
    return "AND " + op1?.name() + ", " + op2?.name();
}

function CMPB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - v2.get());
    lflags.type = TypeFlag.t_CMPb;
    return "CMP " + op1?.name() + ", " + op2?.name();
}

function TESTB(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1b();
    const v2 = lf_var2b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() & v2.get());
    lflags.type = TypeFlag.t_TESTb;
    return "TEST " + op1?.name() + ", " + op2?.name();
}

function ADDW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() + v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ADDw;
    return "ADD " + op1?.name() + ", " + op2?.name();
}

function ADCW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    lflags.oldcf = reg.CF ? 1 : 0;
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() + v2.get() + lflags.oldcf);
    save(op1, res.get());
    lflags.type = TypeFlag.t_ADCw;
    return "ADC " + op1?.name() + ", " + op2?.name();
}

function SBBW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    lflags.oldcf = reg.CF ? 1 : 0;
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - (v2.get() + lflags.oldcf));
    save(op1, res.get());
    lflags.type = TypeFlag.t_SBBw;
    return "SBB " + op1?.name() + ", " + op2?.name();
}

function SUBW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_SUBw;
    return "SUB " + op1?.name() + ", " + op2?.name();
}

function ORW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() | v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ORw;
    return "OR " + op1?.name() + ", " + op2?.name();
}

function XORW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() ^ v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_XORw;
    return "XOR " + op1?.name() + ", " + op2?.name();
}

function ANDW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() & v2.get());
    save(op1, res.get());
    lflags.type = TypeFlag.t_ANDw;
    return "AND " + op1?.name() + ", " + op2?.name();
}

function CMPW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() - v2.get());
    lflags.type = TypeFlag.t_CMPw;
    return "CMP " + op1?.name() + ", " + op2?.name();
}

function TESTW(op1: VName<number>, op2: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    const v1 = lf_var1w();
    const v2 = lf_var2w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    v2.set(op2.get());
    res.set(v1.get() & v2.get());
    lflags.type = TypeFlag.t_TESTw;
    return "TEST " + op1?.name() + ", " + op2?.name();
}

function LoadCF() {
    SETFLAGBIT(FLAG_CF, reg.CF > 0)
}

function INCB(op1: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    LoadCF();
    const v1 = lf_var1b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    res.set(v1.get() + 1);
    save(op1, res.get());
    lflags.type = TypeFlag.t_INCb;
    return "INC " + op1.get();
}

function DECB(op1: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    LoadCF();
    const v1 = lf_var1b();
    const res = lf_resb();
    let lad = load(op1);
    v1.set(lad);
    res.set(v1.get() - 1);
    save(op1, res.get());
    lflags.type = TypeFlag.t_DECb;
    return "DEC " + op1.get();
}

function INCW(op1: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    LoadCF();
    const v1 = lf_var1w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    res.set(v1.get() + 1);
    save(op1, res.get());
    lflags.type = TypeFlag.t_INCw;
    return "INC " + op1.name();
}

function DECW(op1: VName<number>, load: (vname: VName<number>) => number, save: (vname: VName<number>, v: number) => void) {
    LoadCF();
    const v1 = lf_var1w();
    const res = lf_resw();
    let lad = load(op1);
    v1.set(lad);
    res.set(v1.get() - 1);
    save(op1, res.get());
    lflags.type = TypeFlag.t_DECw;
    return "DEC " + op1.name();
}

const TFLG = {
    get O(): boolean {
        return !!reg.OF;
    },
    get NO(): boolean {
        return !reg.OF;
    },
    get B(): boolean {
        return !!reg.CF;
    },
    get NB(): boolean {
        return !reg.CF;
    },
    get Z(): boolean {
        return !!reg.ZF
    },
    get NZ(): boolean {
        return !reg.ZF
    },
    get BE(): boolean {
        return !!reg.CF || !!reg.ZF;
    },
    get NBE(): boolean {
        return !reg.CF && !reg.ZF;
    },
    get S(): boolean {
        return !!reg.SF;
    },
    get NS(): boolean {
        return !reg.SF;
    },
    get P(): boolean {
        return !!reg.PF;
    },
    get NP(): boolean {
        return !reg.PF;
    },
    get L(): boolean {
        return ((reg.SF != 0) != (reg.OF != 0))
    },
    get NL(): boolean {
        return ((reg.SF != 0) == (reg.OF != 0))
    },
    get LE(): boolean {
        return (!!reg.ZF || ((reg.SF != 0) != (reg.OF != 0)))
    },
    get NLE(): boolean {
        return (!reg.ZF && ((reg.SF != 0) == (reg.OF != 0)))
    }
}


function JumpCond16_b(COND: boolean) {
    const adj = Fetchbs(true);
    SAVEIP();
    if (COND) reg.ip += adj;
    return adj.toString(16).padStart(2)
}

function DO_PREFIX_SEG(seg: SegNames) {
    if (reg.IF && CPU_Cycles <= 0) {
        let next = LoadMb({
            get() {
                return core.cseip + 1
            },
            set(v) {
                throw new Error("hz")
            },
            name() {
                return "HZ";
            }
        });
        if (next == 0xf2 || next == 0xf3) next = 0;
    }

    core.base_ds = SegBase(seg);
    core.base_ss = SegBase(seg);
    core.base_val_ds = seg;
    //TODO goto restart_opcode;
}

function AAA() {
    SETFLAGBIT(FLAG_SF, ((reg.al >= 0x7a) && (reg.al <= 0xf9)));
    if ((reg.al & 0xf) > 9) {
        SETFLAGBIT(FLAG_OF, (reg.al & 0xf0) == 0x70);
        reg.ax += 0x106;
        SETFLAGBIT(FLAG_CF, true);
        SETFLAGBIT(FLAG_ZF, (reg.al == 0));
        SETFLAGBIT(FLAG_AF, true);
    } else if (reg.AF) {
        reg.ax += 0x106;
        SETFLAGBIT(FLAG_OF, false);
        SETFLAGBIT(FLAG_CF, true);
        SETFLAGBIT(FLAG_ZF, false);
        SETFLAGBIT(FLAG_AF, true);
    } else {
        SETFLAGBIT(FLAG_OF, false);
        SETFLAGBIT(FLAG_CF, false);
        SETFLAGBIT(FLAG_ZF, (reg.al == 0));
        SETFLAGBIT(FLAG_AF, false);
    }
    SETFLAGBIT(FLAG_PF, parity_lookup[reg.al] > 0);
    reg.al &= 0x0F;
    lflags.type = TypeFlag.t_UNKNOWN;
    return "AAA";
}

function AAS() {
    if ((reg.al & 0x0f) > 9) {
        SETFLAGBIT(FLAG_SF, (reg.al > 0x85));
        reg.ax -= 0x106;
        SETFLAGBIT(FLAG_OF, false);
        SETFLAGBIT(FLAG_CF, true);
        SETFLAGBIT(FLAG_AF, true);
    } else if (reg.AF) {
        SETFLAGBIT(FLAG_OF, ((reg.al >= 0x80) && (reg.al <= 0x85)));
        SETFLAGBIT(FLAG_SF, (reg.al < 0x06) || (reg.al > 0x85));
        reg.ax -= 0x106;
        SETFLAGBIT(FLAG_CF, true);
        SETFLAGBIT(FLAG_AF, true);
    } else {
        SETFLAGBIT(FLAG_SF, (reg.al >= 0x80));
        SETFLAGBIT(FLAG_OF, false);
        SETFLAGBIT(FLAG_CF, false);
        SETFLAGBIT(FLAG_AF, false);
    }
    SETFLAGBIT(FLAG_ZF, (reg.al == 0));
    SETFLAGBIT(FLAG_PF, parity_lookup[reg.al] > 0);
    reg.al &= 0x0F;
    lflags.type = TypeFlag.t_UNKNOWN;
    return "AAS";
}

function DAA() {
    if (((reg.al & 0x0F) > 0x09) || reg.AF) {
        if ((reg.al > 0x99) || reg.CF) {
            reg.al += 0x60;
            SETFLAGBIT(FLAG_CF, true);
        } else {
            SETFLAGBIT(FLAG_CF, false);
        }
        reg.al += 0x06;
        SETFLAGBIT(FLAG_AF, true);
    } else {
        if ((reg.al > 0x99) || reg.CF) {
            reg.al += 0x60;
            SETFLAGBIT(FLAG_CF, true);
        } else {
            SETFLAGBIT(FLAG_CF, false);
        }
        SETFLAGBIT(FLAG_AF, false);
    }
    SETFLAGBIT(FLAG_SF, (reg.al & 0x80) > 0);
    SETFLAGBIT(FLAG_ZF, (reg.al == 0));
    SETFLAGBIT(FLAG_PF, parity_lookup[reg.al] > 0);
    lflags.type = TypeFlag.t_UNKNOWN;
    return "DAA";
}

function DAS() {
    let osigned = reg.al & 0x80;
    if (((reg.al & 0x0f) > 9) || reg.AF) {
        if ((reg.al > 0x99) || reg.CF) {
            reg.al -= 0x60;
            SETFLAGBIT(FLAG_CF, true);
        } else {
            SETFLAGBIT(FLAG_CF, (reg.al <= 0x05));
        }
        reg.al -= 6;
        SETFLAGBIT(FLAG_AF, true);
    } else {
        if ((reg.al > 0x99) || reg.CF) {
            reg.al -= 0x60;
            SETFLAGBIT(FLAG_CF, true);
        } else {
            SETFLAGBIT(FLAG_CF, false);
        }
        SETFLAGBIT(FLAG_AF, false);
    }
    SETFLAGBIT(FLAG_OF, (osigned > 0) && ((reg.al & 0x80) == 0));
    SETFLAGBIT(FLAG_SF, (reg.al & 0x80) > 0);
    SETFLAGBIT(FLAG_ZF, (reg.al == 0));
    SETFLAGBIT(FLAG_PF, parity_lookup[reg.al] > 0);
    lflags.type = TypeFlag.t_UNKNOWN;
    return "DAS";
}

function CPU_CALL(use32: boolean, selector: number, offset: number, oldeip: number) {
    throw new Error("IMPLEMENT CPU_CALL");
}

function CPU_PUSHF(b: boolean): boolean {
    throw new Error("IMPLEMENT PUSHF");
}

function CPU_POPF(b: boolean): boolean {
    throw new Error("IMPLEMENT POPF");
}

function GetEADirect(i: number): VName<number> {
    throw new Error("IMPLEMENT GetEADirect " + i);
}


function DoString(...a: any[]): string {
    throw new Error("IMPLEMENT GetEADirect ");
}

enum R {
    OUTSB, OUTSW, OUTSD,
    INSB, INSW, INSD,
    MOVSB, MOVSW, MOVSD,
    LODSB, LODSW, LODSD,
    STOSB, STOSW, STOSD,
    SCASB, SCASW, SCASD,
    CMPSB, CMPSW, CMPSD
};


function which(a: number) {
    switch (a) {
        case 0x00:												/* ADD Eb,Gb */
            return RMEbGb(ADDB);
        case 0x01:												/* ADD Ew,Gw */
            return RMEwGw(ADDW);
        case 0x02:												/* ADD Gb,Eb */
            return RMGbEb(ADDB);
        case 0x03:												/* ADD Gw,Ew */
            return RMGwEw(ADDW);
        case 0x04:												/* ADD AL,Ib */
            return ALIb(ADDB);
        case 0x05:												/* ADD AX,Iw */
            return AXIw(ADDW);
        case 0x06:												/* PUSH ES */
            Push_16(SegValue(SegNames.es));
            return "PUSH ES";
        case 0x07:												/* POP ES */
            if (CPU_PopSeg(SegNames.es, false)) RUNEXCEPTION();
            return "POP ES";
        case 0x08:												/* OR Eb,Gb */
            return RMEbGb(ORB);
        case 0x09:												/* OR Ew,Gw */
            return RMEwGw(ORW);
        case 0x0a:												/* OR Gb,Eb */
            return RMGbEb(ORB);
        case 0x0b:												/* OR Gw,Ew */
            return RMGwEw(ORW);
        case 0x0c:												/* OR AL,Ib */
            return ALIb(ORB);
        case 0x0d:												/* OR AX,Iw */
            return AXIw(ORW);
        case 0x0e:												/* PUSH CS */
            Push_16(SegValue(SegNames.cs));
            return "PUSH CS";
        case 0x0f:												/* 2 byte opcodes*/
            if (CPU_PopSeg(SegNames.cs, false)) RUNEXCEPTION();
            return "POP CS";
        case 0x10:												/* ADC Eb,Gb */
            return RMEbGb(ADCB);
        case 0x11:												/* ADC Ew,Gw */
            return RMEwGw(ADCW);
        case 0x12:												/* ADC Gb,Eb */
            return RMGbEb(ADCB);
        case 0x13:												/* ADC Gw,Ew */
            return RMGwEw(ADCW);
        case 0x14:												/* ADC AL,Ib */
            return ALIb(ADCB);
        case 0x15:												/* ADC AX,Iw */
            return AXIw(ADCW);
        case 0x16:												/* PUSH SS */
            Push_16(SegValue(SegNames.ss));
            return "PUSH SS"
        case 0x17:												/* POP SS */
            if (CPU_PopSeg(SegNames.ss, false)) RUNEXCEPTION();
            return "POP SS";
        case 0x18:												/* SBB Eb,Gb */
            return RMEbGb(SBBB);
        case 0x19:												/* SBB Ew,Gw */
            return RMEwGw(SBBW);
        case 0x1a:												/* SBB Gb,Eb */
            return RMGbEb(SBBB);
        case 0x1b:												/* SBB Gw,Ew */
            return RMGwEw(SBBW);
        case 0x1c:												/* SBB AL,Ib */
            return ALIb(SBBB);
        case 0x1d:												/* SBB AX,Iw */
            return AXIw(SBBW);
        case 0x1e:												/* PUSH DS */
            Push_16(SegValue(SegNames.ds));
            return "PUSH DS";
        case 0x1f:												/* POP DS */
            if (CPU_PopSeg(SegNames.ds, false)) RUNEXCEPTION();
            return "POP DS";
        case 0x20:												/* AND Eb,Gb */
            return RMEbGb(ANDB);
        case 0x21:												/* AND Ew,Gw */
            return RMEwGw(ANDW);
        case 0x22:												/* AND Gb,Eb */
            return RMGbEb(ANDB);
        case 0x23:												/* AND Gw,Ew */
            return RMGwEw(ANDW);
        case 0x24:												/* AND AL,Ib */
            return ALIb(ANDB);
        case 0x25:												/* AND AX,Iw */
            return AXIw(ANDW);
        case 0x26:												/* SEG ES: */
            DO_PREFIX_SEG(SegNames.es);
            return "SEG ES";
        case 0x27:												/* DAA */
            return DAA();
        case 0x28:												/* SUB Eb,Gb */
            return RMEbGb(SUBB);
        case 0x29:												/* SUB Ew,Gw */
            return RMEwGw(SUBW);
        case 0x2a:												/* SUB Gb,Eb */
            return RMGbEb(SUBB);
        case 0x2b:												/* SUB Gw,Ew */
            return RMGwEw(SUBW);
        case 0x2c:												/* SUB AL,Ib */
            return ALIb(SUBB);
        case 0x2d:												/* SUB AX,Iw */
            return AXIw(SUBW);
        case 0x2e:												/* SEG CS: */
            DO_PREFIX_SEG(SegNames.cs);
            return "SEG CS";
        case 0x2f:												/* DAS */
            return DAS();
        case 0x30:												/* XOR Eb,Gb */
            return RMEbGb(XORB);
        case 0x31:												/* XOR Ew,Gw */
            return RMEwGw(XORW);
        case 0x32:												/* XOR Gb,Eb */
            return RMGbEb(XORB);
        case 0x33:												/* XOR Gw,Ew */
            return RMGwEw(XORW);
        case 0x34:												/* XOR AL,Ib */
            return ALIb(XORB);
        case 0x35:												/* XOR AX,Iw */
            return AXIw(XORW);
        case 0x36:												/* SEG SS: */
            DO_PREFIX_SEG(SegNames.ss);
            return "SEG SS";
        case 0x37:												/* AAA */
            return AAA();
        case 0x38:												/* CMP Eb,Gb */
            return RMEbGb(CMPB);
        case 0x39:												/* CMP Ew,Gw */
            return RMEwGw(CMPW);
        case 0x3a:												/* CMP Gb,Eb */
            return RMGbEb(CMPB);
        case 0x3b:												/* CMP Gw,Ew */
            return RMGwEw(CMPW);
        case 0x3c:												/* CMP AL,Ib */
            return ALIb(CMPB);
        case 0x3d:												/* CMP AX,Iw */
            return AXIw(CMPW);
        case 0x3e:												/* SEG DS: */
            DO_PREFIX_SEG(SegNames.ds);
            return "SEG DS";
        case 0x3f:												/* AAS */
            return AAS();
        case 0x40:												/* INC AX */
            return INCW(reg.s_ax, LoadRw, SaveRw);
        case 0x41:												/* INC CX */
            return INCW(reg.s_cx, LoadRw, SaveRw);
        case 0x42:												/* INC DX */
            return INCW(reg.s_dx, LoadRw, SaveRw);
        case 0x43:												/* INC BX */
            return INCW(reg.s_bx, LoadRw, SaveRw);
        case 0x44:												/* INC SP */
            return INCW(reg.s_sp, LoadRw, SaveRw);
        case 0x45:												/* INC BP */
            return INCW(reg.s_bp, LoadRw, SaveRw);
        case 0x46:												/* INC SI */
            return INCW(reg.s_si, LoadRw, SaveRw);
        case 0x47:												/* INC DI */
            return INCW(reg.s_di, LoadRw, SaveRw);
        case 0x48:												/* DEC AX */
            return DECW(reg.s_ax, LoadRw, SaveRw);
        case 0x49:												/* DEC CX */
            return DECW(reg.s_cx, LoadRw, SaveRw);
        case 0x4a:												/* DEC DX */
            return DECW(reg.s_dx, LoadRw, SaveRw);
        case 0x4b:												/* DEC BX */
            return DECW(reg.s_bx, LoadRw, SaveRw);
        case 0x4c:												/* DEC SP */
            return DECW(reg.s_sp, LoadRw, SaveRw);
        case 0x4d:												/* DEC BP */
            return DECW(reg.s_bp, LoadRw, SaveRw);
        case 0x4e:												/* DEC SI */
            return DECW(reg.s_si, LoadRw, SaveRw);
        case 0x4f:												/* DEC DI */
            return DECW(reg.s_di, LoadRw, SaveRw);
        case 0x50:												/* PUSH AX */
            Push_16(reg.ax);
            return "PUSH AX";
        case 0x51:												/* PUSH CX */
            Push_16(reg.cx);
            return "PUSH CX";
        case 0x52:												/* PUSH DX */
            Push_16(reg.dx);
            return "PUSH DX";
        case 0x53:												/* PUSH BX */
            Push_16(reg.bx);
            return "PUSH BX";
        case 0x54:												/* PUSH SP */
            Push_16(reg.sp - 2);
            return "PUSH SP";
        case 0x55:												/* PUSH BP */
            Push_16(reg.bp);
            return "PUSH BP";
        case 0x56:												/* PUSH SI */
            Push_16(reg.si);
            return "PUSH BI";
        case 0x57:												/* PUSH DI */
            Push_16(reg.di);
            return "PUSH DI";
        case 0x58:												/* POP AX */
            reg.ax = Pop_16();
            return "POP AX";
        case 0x59:												/* POP CX */
            reg.cx = Pop_16();
            return "POP CX";
        case 0x5a:												/* POP DX */
            reg.dx = Pop_16();
            return "POP DX";
        case 0x5b:												/* POP BX */
            reg.bx = Pop_16();
            return "POP BX";
        case 0x5c:												/* POP SP */
            reg.sp = Pop_16();
            return "POP SP";
        case 0x5d:												/* POP BP */
            reg.bp = Pop_16();
            return "POP BP";
        case 0x5e:												/* POP SI */
            reg.si = Pop_16();
            return "POP SI";
        case 0x5f:												/* POP DI */
            reg.di = Pop_16();
            return "POP DI";

        case 0x60:												/* PUSHA */
        case 0x70:												/* JO */
            /* alias of 0x70, jo. see also [http://www.os2museum.com/wp/undocumented-8086-opcodes/] */
            return "JO " + JumpCond16_b(TFLG.O);
        case 0x61:												/* POPA */
        case 0x71:												/* JNO */
            /* alias of 0x71, jno */
            return "JNO " + JumpCond16_b(TFLG.NO);
        case 0x62:												/* BOUND */
        case 0x72:												/* JB */
            /* alias of 0x72, jb */
            return "JB " + JumpCond16_b(TFLG.B);
        case 0x63:												/* ARPL Ew,Rw */
        case 0x73:												/* JNB */
            /* alias of 0x73, jnb */
            return "JNB " + JumpCond16_b(TFLG.NB);
        case 0x64:												/* SEG FS: */
        case 0x74:												/* JZ */
            /* alias of 0x74, jz */
            return "JZ " + JumpCond16_b(TFLG.Z);
        case 0x65:												/* SEG GS: */
        case 0x75:												/* JNZ */
            /* alias of 0x75, jnz */
            return "JNZ " + JumpCond16_b(TFLG.NZ);
        case 0x66:												/* Operand Size Prefix (386+) */
        case 0x76:												/* JBE */
            /* alias of 0x76, jbe */
            return "JBE " + JumpCond16_b(TFLG.BE);
        case 0x67:												/* Address Size Prefix (386+) */
        case 0x77:												/* JNBE */
            /* alias of 0x77, jnbe */
            return "JNBE " + JumpCond16_b(TFLG.NBE);
        case 0x68:												/* PUSH Iw */
        case 0x78:												/* JS */
            /* alias of 0x78, js */
            return "JS " + JumpCond16_b(TFLG.S);
        case 0x69:												/* IMUL Gw,Ew,Iw */
        case 0x79:												/* JNS */
            /* alias of 0x79, jns */
            return "JNS " + JumpCond16_b(TFLG.NS);
        case 0x6a:												/* PUSH Ib */
        case 0x7a:												/* JP */
            /* alias of 0x7A, jp */
            return "JP " + JumpCond16_b(TFLG.P);
        case 0x6b:												/* JNP */
        case 0x7b:												/* JNP */
            /* alias of 0x7B, jnp */
            return "JNP " + JumpCond16_b(TFLG.NP);
        case 0x6c:												/* INSB */
        case 0x7c:												/* JL */
            /* alias of 0x7C, jl */
            return "JL " + JumpCond16_b(TFLG.L);
        case 0x6d:												/* INSW */
        case 0x7d:												/* JNL */
            return "JNL " + JumpCond16_b(TFLG.NL);
        case 0x6e:												/* OUTSB */
        case 0x7e:												/* JLE */
            return "JLE " + JumpCond16_b(TFLG.LE);
        case 0x6f:												/* OUTSW */
        case 0x7f:												/* JNLE */
            return "JNLE " + +JumpCond16_b(TFLG.NLE);
        case 0x80:
        case 0x82: {
            let rm = GetRM();
            let which = (rm >> 3) & 7;
            if (rm >= 0xc0) {
                let earb = GetEArb(rm);
                let ib = Fetchbr(true);
                switch (which) {
                    case 0x00:
                        return ADDB(earb, ib, LoadRb, SaveRb);
                    case 0x01:
                        return ORB(earb, ib, LoadRb, SaveRb);
                    case 0x02:
                        return ADCB(earb, ib, LoadRb, SaveRb);
                    case 0x03:
                        return SBBB(earb, ib, LoadRb, SaveRb);
                    case 0x04:
                        return ANDB(earb, ib, LoadRb, SaveRb);
                    case 0x05:
                        return SUBB(earb, ib, LoadRb, SaveRb);
                    case 0x06:
                        return XORB(earb, ib, LoadRb, SaveRb);
                    case 0x07:
                        return CMPB(earb, ib, LoadRb, SaveRb);
                }
            } else {
                let eaa = GetEAa(rm);
                let ib = Fetchbr(true);
                switch (which) {
                    case 0x00:
                        return ADDB(eaa, ib, LoadMb, SaveMb);
                    case 0x01:
                        return ORB(eaa, ib, LoadMb, SaveMb);
                    case 0x02:
                        return ADCB(eaa, ib, LoadMb, SaveMb);
                    case 0x03:
                        return SBBB(eaa, ib, LoadMb, SaveMb);
                    case 0x04:
                        return ANDB(eaa, ib, LoadMb, SaveMb);
                    case 0x05:
                        return SUBB(eaa, ib, LoadMb, SaveMb);
                    case 0x06:
                        return XORB(eaa, ib, LoadMb, SaveMb);
                    case 0x07:
                        return CMPB(eaa, ib, LoadMb, SaveMb);
                }
            }
        }
        case 0x81:												/* Grpl Ew,Iw */
        {
            let rm = GetRM()
            let which = (rm >> 3) & 7;
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                let iw = Fetchwr(true);
                switch (which) {
                    case 0x00:
                        return ADDW(earw, iw, LoadRw, SaveRw);
                    case 0x01:
                        return ORW(earw, iw, LoadRw, SaveRw);
                    case 0x02:
                        return ADCW(earw, iw, LoadRw, SaveRw);
                    case 0x03:
                        return SBBW(earw, iw, LoadRw, SaveRw);
                    case 0x04:
                        return ANDW(earw, iw, LoadRw, SaveRw);
                    case 0x05:
                        return SUBW(earw, iw, LoadRw, SaveRw);
                    case 0x06:
                        return XORW(earw, iw, LoadRw, SaveRw);
                    case 0x07:
                        return CMPW(earw, iw, LoadRw, SaveRw);
                }
            } else {
                let eaa = GetEAa(rm);
                let iw = Fetchwr(true);
                switch (which) {
                    case 0x00:
                        return ADDW(eaa, iw, LoadMw, SaveMw);
                    case 0x01:
                        return ORW(eaa, iw, LoadMw, SaveMw);
                    case 0x02:
                        return ADCW(eaa, iw, LoadMw, SaveMw);
                    case 0x03:
                        return SBBW(eaa, iw, LoadMw, SaveMw);
                    case 0x04:
                        return ANDW(eaa, iw, LoadMw, SaveMw);
                    case 0x05:
                        return SUBW(eaa, iw, LoadMw, SaveMw);
                    case 0x06:
                        return XORW(eaa, iw, LoadMw, SaveMw);
                    case 0x07:
                        return CMPW(eaa, iw, LoadMw, SaveMw);
                }
            }
        }
        case 0x83:												/* Grpl Ew,Ix */
        {
            let rm = GetRM()
            let which = (rm >> 3) & 7;
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                let iw = Fetchbr(true);
                switch (which) {
                    case 0x00:
                        ADDW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x01:
                        ORW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x02:
                        ADCW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x03:
                        SBBW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x04:
                        ANDW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x05:
                        SUBW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x06:
                        XORW(earw, iw, LoadRw, SaveRw);
                        break;
                    case 0x07:
                        CMPW(earw, iw, LoadRw, SaveRw);
                        break;
                }
            } else {
                let eaa = GetEAa(rm);
                let iw = Fetchbr(true);
                switch (which) {
                    case 0x00:
                        return ADDW(eaa, iw, LoadMw, SaveMw);
                    case 0x01:
                        return ORW(eaa, iw, LoadMw, SaveMw);
                    case 0x02:
                        return ADCW(eaa, iw, LoadMw, SaveMw);
                    case 0x03:
                        return SBBW(eaa, iw, LoadMw, SaveMw);
                    case 0x04:
                        return ANDW(eaa, iw, LoadMw, SaveMw);
                    case 0x05:
                        return SUBW(eaa, iw, LoadMw, SaveMw);
                    case 0x06:
                        return XORW(eaa, iw, LoadMw, SaveMw);
                    case 0x07:
                        return CMPW(eaa, iw, LoadMw, SaveMw);
                }
            }
            return "0x8[0-3] HZ";
        }
        case 0x84:												/* TEST Eb,Gb */
            return RMEbGb(TESTB);
        case 0x85:										    /* TEST Ew,Gw */
            return RMEwGw(TESTW);
        case 0x86: {											/* XCHG Eb,Gb */
            let {rm, rb} = GetRMrb();
            let oldrmrb = rb.get(true);
            if (rm >= 0xc0) {
                let earb = GetEArb(rm);
                rb.set(earb.get(true));
                earb.set(oldrmrb);
                return `XCH ${earb.name()}, ${rb.name()}`;
            } else {
                let eaa = GetEAa(rm);
                rb.set(LoadMb(eaa));
                SaveMb(eaa, oldrmrb);
                return `XCH ${eaa.name()}, ${rb.name()}`;
            }

        }
        case 0x87: {										/* XCHG Ew,Gw */

            let {rm, rw} = GetRMrw();
            let oldrmrb = rw.get(true);
            if (rm >= 0xc0) {
                let earb = GetEArb(rm);
                rw.set(earb.get(true));
                earb.set(oldrmrb);
                return `XCH ${earb.name()}, ${rw.name()}`;

            } else {
                let eaa = GetEAa(rm);
                rw.set(LoadMb(eaa));
                SaveMb(eaa, oldrmrb);
                return `XCH ${eaa.name()}, ${rw.name()}`;

            }

        }
        case 0x88: {										/* MOV Eb,Gb */

            let {rm, rb} = GetRMrb();
            if (rm >= 0xc0) {
                let earb = GetEArb(rm);
                earb.set(rb.get(true));
                return `MOV ${earb.name()}, ${rb.name()}`;
            } else {
                let eaa = GetEAa(rm);
                SaveMb(eaa, rb.get(true));
                return `MOV ${eaa.name()}, ${rb.name()}`;
            }
        }
        case 0x89: {											/* MOV Ew,Gw */
            let {rm, rw} = GetRMrw();
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                earw.set(rw.get(true));
                return `MOV ${earw.name()}, ${rw.name()}`;
            } else {
                let eaa = GetEAa(rm);
                SaveMw(eaa, rw.get(true));
                return `MOV ${eaa.name()}, ${rw.name()}`;
            }
        }
        case 0x8a:												/* MOV Gb,Eb */
        {
            let {rm, rb} = GetRMrb();
            if (rm >= 0xc0) {
                let earb = GetEArb(rm);
                rb.set(earb.get(true));
                return `MOV ${rb.name()}, ${earb.name()}`;
            } else {
                let eaa = GetEAa(rm);
                rb.set(LoadMb(eaa));
                return `MOV ${rb.name()}, ${eaa.name()}`;
            }
        }
        case 0x8b:												/* MOV Gw,Ew */
        {
            let {rm, rw} = GetRMrw();
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                earw.set(rw.get(true));
                return `MOV ${rw.name()}, ${earw.name()}`;
            } else {
                let eaa = GetEAa(rm);
                SaveMw(eaa, rw.get(true));
                return `MOV ${rw.name()}, ${eaa.name()}`;
            }
        }
        case 0x8c:											/* Mov Ew,Sw */
        {
            let rm = GetRM();
            let val;
            let name = "";
            let which = (rm >> 3) & 7;
            switch (which) {
                case 0x00:					/* MOV Ew,ES */
                    val = SegValue(SegNames.es);
                    name = "ES";
                    break;
                case 0x01:					/* MOV Ew,CS */
                    val = SegValue(SegNames.cs);
                    name = "CS";
                    break;
                case 0x02:					/* MOV Ew,SS */
                    val = SegValue(SegNames.ss);
                    name = "SS";
                    break;
                case 0x03:					/* MOV Ew,DS */
                    val = SegValue(SegNames.ds);
                    name = "DS";
                    break;
                case 0x04:					/* MOV Ew,FS */
                    val = SegValue(SegNames.fs);
                    name = "FS";
                    break;
                case 0x05:					/* MOV Ew,GS */
                    val = SegValue(SegNames.gs);
                    name = "GS";
                    break;
                default:
                    return ("CPU:8c:Illegal RM Byte");
                //todo goto illegal_opcode;
            }
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                earw.set(val);
                return `MOV ${earw.name()}, ${name}`;
            } else {
                let eaa = GetEAa(rm);
                SaveMw(eaa, val);
                return `MOV ${eaa.name()}, ${name}`;
            }
            break;
        }
        case 0x8d:												/* LEA Gw */
        {
            let {rm, rw} = GetRMrw();
            if (rm >= 0xc0) return "illegal_opcode"; //todogoto illegal_opcode;     // Direct register causes #UD exception
            //Little hack to always use segprefixed version
            core.base_ds = core.base_ss = 0;
            rw.set(EATable[rm].get(true))

            break;
        }
        case 0x8e:											/* MOV Sw,Ew */
        {
            let rm = GetRM();
            let val = 0;
            let name = "HZ";
            let which = (rm >> 3) & 7;
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                name = earw.name();
                val = earw.get(true);
            } else {
                let eaa = GetEAa(rm);
                name = eaa.name();
                val = LoadMwr(eaa).get(true);
            }
            switch (which) {
                case 0x00:                  /* MOV ES,Ew */
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV ES, " + name;
                case 0x01:                  /* MOV CS,Ew (8086) */
                    CPU_Cycles++; //Always do another instruction
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV CS, " + name;
                case 0x02:                  /* MOV SS,Ew */
                    return "MOV SS, " + name;
                case 0x03:                  /* MOV DS,Ew */
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV DS, " + name;
                case 0x04:                  /* Alias of MOV ES,Ew (8086) */
                    which = 0;
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV ES, " + name;
                case 0x05:                  /* Alias of MOV CS,Ew (8086) */
                    which = 1;
                    CPU_Cycles++; //Always do another instruction
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV CS, " + name;
                case 0x06:                  /* Alias of MOV SS,Ew (8086) */
                    which = 2;
                    CPU_Cycles++; //Always do another instruction
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV SS, " + name;
                case 0x07:                  /* Alias of MOV DS,Ew (8086) */
                    which = 3;
                    if (CPU_SetSegGeneral(which, val)) RUNEXCEPTION();
                    return "MOV DS, " + name;
                default:
                    return "goto illegal_opcode";
            }

        }
        case 0x8f:												/* POP Ew */
        {
            let val = Pop_16();
            let rm = GetRM();
            if (rm >= 0xc0) {
                let earw = GetEArw(rm);
                earw.set(val);
                return `POP ${earw.name()}`;
            } else {
                let eaa = GetEAa(rm);
                SaveMw(eaa, val);
                return `POP ${eaa.name()}`;
            }
        }
        case 0x90:												/* NOP */
            return "NOP";
        case 0x91:												/* XCHG CX,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.cx;
            reg.cx = temp;
        }
            return "XCH CX,AX"
        case 0x92:												/* XCHG DX,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.dx;
            reg.dx = temp;
        }
            return "XCH DX,AX"
        case 0x93:												/* XCHG BX,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.bx;
            reg.bx = temp;
        }
            return "XCH BX,AX"
        case 0x94:												/* XCHG SP,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.sp;
            reg.sp = temp;
        }
            return "XCH SP,AX"
        case 0x95:												/* XCHG BP,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.bp;
            reg.bp = temp;
        }
            return "XCH BP,AX"
        case 0x96:												/* XCHG SI,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.si;
            reg.si = temp;
        }
            return "XCH SI,AX"
        case 0x97:												/* XCHG DI,AX */
        {
            let temp = reg.ax;
            reg.ax = reg.di;
            reg.di = temp;
        }
            return "XCH DI,AX"
        case 0x98:												/* CBW */
            reg.ax = reg.al;
            return "CBW";
        case 0x99:											/* CWD */
            if (reg.ax & 0x8000) reg.dx = 0xffff; else reg.dx = 0;
            return "CWD";
        case 0x9a:												/* CALL Ap */
        {
            FillFlags();
            let newip = Fetchw(true);
            let newcs = Fetchw(true);
            CPU_CALL(false, newcs, newip, GETIP());
            return "CALL " + newcs + ":" + newip;
        }
        case 0x9b:												/* WAIT */
            return "WAIT" /* No waiting here */
        case 0x9c:												/* PUSHF */
            if (CPU_PUSHF(false)) RUNEXCEPTION();
            return "PUSHF";
        case 0x9d:												/* POPF */
            if (CPU_POPF(false)) RUNEXCEPTION();
            return "POPF";
        case 0x9e:												/* SAHF */
            reg.flags |= reg.ah;
            return "SAHF";
        case 0x9f:												/* LAHF */
            FillFlags();
            reg.ah = reg.flags & 0xff;
            return "LAHF";
        case 0xa0:												/* MOV AL,Ob */
        { /* NTS: GetEADirect may jump instead to the GP# trigger code if the offset exceeds the segment limit.
		          For whatever reason, NOT signalling GP# in that condition prevents Windows 95 OSR2 from starting a DOS VM. Weird. */
            let eaa = GetEADirect(1);
            reg.al = LoadMb(eaa);
            return "MOV AL," + eaa.name();
        }
        case 0xa1:												/* MOV AX,Ow */
        { /* NTS: GetEADirect may jump instead to the GP# trigger code if the offset exceeds the segment limit.
		          For whatever reason, NOT signalling GP# in that condition prevents Windows 95 OSR2 from starting a DOS VM. Weird. */
            let eaa = GetEADirect(2);
            reg.ax = LoadMw(eaa);
            return "MOV AX," + eaa.name();
        }
        case 0xa2:												/* MOV Ob,AL */
        { /* NTS: GetEADirect may jump instead to the GP# trigger code if the offset exceeds the segment limit.
		          For whatever reason, NOT signalling GP# in that condition prevents Windows 95 OSR2 from starting a DOS VM. Weird. */
            let eaa = GetEADirect(1);
            SaveMb(eaa, reg.al);
            return "MOV " + eaa.name() + ",AL"
        }
        case 0xa3:												/* MOV Ow,AX */
        { /* NTS: GetEADirect may jump instead to the GP# trigger code if the offset exceeds the segment limit.
		          For whatever reason, NOT signalling GP# in that condition prevents Windows 95 OSR2 from starting a DOS VM. Weird. */
            let eaa = GetEADirect(2);
            SaveMw(eaa, reg.ax);
            return "MOV " + eaa.name() + ",AX"
        }
        case 0xa4:												/* MOVSB */
            DoString(R.MOVSB);
            return "MOVSB";
        case 0xa5:												/* MOVSW */
            DoString(R.MOVSW);
            return "MOVSW";
        case 0xa6:												/* CMPSB */
            DoString(R.CMPSB);
            return "CMPSB";
        case 0xa7:												/* CMPSW */
            DoString(R.CMPSW);
            return "CMPSW";
        case 0xa8:												/* TEST AL,Ib */
            return ALIb(TESTB);
        case 0xa9:												/* TEST AX,Iw */
            return AXIw(TESTW);
        case 0xaa:												/* STOSB */
            DoString(R.STOSB);
            return "STOSB";
        case 0xab:												/* STOSW */
            DoString(R.STOSW);
            return "STOSW";
        case 0xac:												/* LODSB */
            DoString(R.LODSB);
            return "LODSB";
        case 0xad:												/* LODSW */
            DoString(R.LODSW);
            return "LODSW";
        case 0xae:												/* SCASB */
            DoString(R.SCASB);
            return "SCASB";
        case 0xaf:												/* SCASW */
            DoString(R.SCASW);
            return "SCASW";
        case 0xb0:												/* MOV AL,Ib */
            reg.al = Fetchb(true);
            return "MOV AL, ??";
        case 0xb1:												/* MOV CL,Ib */
            reg.cl = Fetchb(true);
            return "MOV CL, ??";
        case 0xb2:												/* MOV DL,Ib */
            reg.dl = Fetchb(true);
            return "MOV DL, ??";
        case 0xb3:												/* MOV BL,Ib */
            reg.bl = Fetchb(true);
            return "MOV BL, ?";
        case 0xb4:												/* MOV AH,Ib */
            reg.ah = Fetchb(true);
            return "MOV AH, ?";
        case 0xb5:												/* MOV CH,Ib */
            reg.ch = Fetchb(true);
            return "MOV CH, ?";
        case 0xb6:												/* MOV DH,Ib */
            reg.dh = Fetchb(true);
            return "MOV DH, ?";
        case 0xb7:												/* MOV BH,Ib */
            reg.bh = Fetchb(true);
            return "MOV BH, ?";
        case 0xb8:												/* MOV AX,Iw */
            reg.ax = Fetchw(true);
            return "MOV AX, ?";
        case 0xb9:												/* MOV CX,Iw */
            reg.cx = Fetchw(true);
            return "MOV CX, ?";
        case 0xba:												/* MOV DX,Iw */
            reg.dx = Fetchw(true);
            return "MOV DX, ?";
        case 0xbb:												/* MOV BX,Iw */
            reg.bx = Fetchw(true);
            return "MOV BX, ?";
        case 0xbc:												/* MOV SP,Iw */
            reg.sp = Fetchw(true);
            return "MOV SP, ?";
        case 0xbd:												/* MOV BP.Iw */
            reg.bp = Fetchw(true);
            return "MOV BP, ?";
        case 0xbe:												/* MOV SI,Iw */
            reg.si = Fetchw(true);
            return "MOV SI, ?";
        case 0xbf:												/* MOV DI,Iw */
            reg.di = Fetchw();
            return "MOV DI, ?";
        case 0xc0:												/* Alias of RETN Iw (0xC2) on 8086 */
        case 0xc2: {
            let new_eip = Pop_16();
            reg.esp += Fetchw(true);
            reg.eip = new_eip;
            return "RETN ESP";
        }
        case 0xc1:											/* Alias of RETN (0xC3) on 8086 */
            reg.eip = Pop_16();
            return "RETN";
        case 0xc3:												/* RETN */
            reg.eip = Pop_16();
            return "RETN EIP";
        case 0xc4:												/* LES */
        {
            let {rm, rw} = GetRMrw();
            if (rm >= 0xc0) return "goto illegal_opcode";
            let eaa = GetEAa(rm)
            if (CPU_SetSegGeneral(SegNames.es, LoadMw({
                get() {
                    return eaa.get() + 2;
                },
                set() {
                    throw new Error("HZ");
                },
                name() {
                    return eaa.name();
                }
            }))) RUNEXCEPTION();
            rw.set(LoadMw(eaa));
            return "LEA";
        }
        case 0xc5:												/* LDS */
        {
            let {rm, rw} = GetRMrw();
            if (rm >= 0xc0) return "goto illegal_opcode";
            let eaa = GetEAa(rm)
            if (CPU_SetSegGeneral(SegNames.ds, LoadMw({
                get() {
                    return eaa.get() + 2;
                },
                set() {
                    throw new Error("HZ");
                },
                name() {
                    return eaa.name();
                }
            }))) RUNEXCEPTION();
            return "LDS";
        }
        case 0xc6:												/* MOV Eb,Ib */
        {
            return "MOV Eb, Ib"
        }
        case 0xc7:												/* MOV EW,Iw */
        {
            return "MOV Ew, Iw"
        }
        case 0xc8:
        case 0xc9:
        case 0xca:
        case 0xcb:
            FillFlags();
            //TODO CPU_RET(false,0,GETIP());
            return "INT3"
        case 0xcc:
            //TODO CPU_SW_Interrupt_NoIOPLCheck(3,GETIP);
            return "INT3"
        case 0xcd: {
            let num = Fetchbr(true);
            return "INT" + num.name();
        }
        case 0xce: {
            if (reg.OF) {
                //TODO  CPU_SW_Interrupt(4,GETIP);
                return "INT4"
            }

        }
    }
}

let cycle_count = 0;

function restart_opcode() {

    let b = core.opcode_index + Fetchb(true);
    let res = which(b);
    cpu_regs.ip.dword(0, core.cseip + SegValue(SegNames.cs))
    return res;
}

function STEP() {
    core.cseip = SegValue(SegNames.cs) + reg.eip;
    core.prefixes = 0;
    core.opcode_index = 0;
    last_ea86_offset = 0;
    core.ea_table = EATable;
    core.base_ds = SegValue(SegNames.ds);
    core.base_ss = SegValue(SegNames.ss);
    core.base_val_ds = SegNames.ds;
    cycle_count++;
    return restart_opcode();
}

function skip_saveip() {
    FillFlags();
    return "NONE";
}

function prefix_out() {
}

function RUN(show?: number) {
    if (CPU_Cycles <= 0)
        return "NONE";
    let step: any[] = [];
    while (CPU_Cycles-- > 0) {
        let s = STEP();
        if (show) {
            console.log(cycle_count.toString().padStart(5, '0'), s);
            if (show > 1) console.log(status());
        }
        step.push(s);
    }
    step.push(skip_saveip());
    return step;
}



MemBase.write([])


CPU_Cycles = 0x10;
let run: any = RUN(1);

