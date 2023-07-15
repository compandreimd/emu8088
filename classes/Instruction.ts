import {Mod, Registers, RM, Sizes} from "./Registers";
import Cpu from "./Cpu";
import {AddressValue, checkParity} from "./Utils";

class Instruction{
    static getInstructions(){
        return Instruction.#list;
    }
    static #list: Instruction[] = []
    #name:string
    #regs:RegExp
    #bins:RegExp[]
    #run : (cpu:Cpu, args:Map<string, any>) => void
    constructor(name:string, rstr:RegExp, rbins: RegExp[], run?:(cpu:Cpu, args:Map<string, any>) => void) {
        this.#name = name;
        this.#regs = rstr;
        this.#bins = rbins;
        this.#run = run;
        Instruction.#list.push(this);
    }
    get Name(){
        return this.#name;
    }
    checkStr(str:string):boolean{
        return str.match(this.#regs) != null;
    }
    check(n:number[], offset:number = 0):boolean{
        let t = true;
        let d: Map<string, any> = new Map();
        for(let i = 0; i < n.length; i++){
            if(this.#bins[i]) {
                let str = n[i + offset].toString(2).padStart(8, '0');
                let m =  str.match(this.#bins[i]);
                if(m == null){
                    t = false;
                    break;
                }
                else {
                    for(let k in d){
                        if(d.has(k)) {
                            if(d.get(k) ==  parseInt(d[k], 2)) {
                                t = false;
                                break;
                            }
                        }
                        d.set(k, parseInt(d[k], 2))
                    }
                    if(!t) break;
                }
            }

        }
        return t;
    }
    asASM(n:number[], offset:number = 0):{asm:string, size: number, bytes:number[], args?:Map<string, any>}{
        let config = this.getGroups(n, offset);
        let str = "";
        let size = 1;
        let bytes = [];
        let args = new Map<string, any>();
        if(n[offset] == 0xE8){
            let addr = (n[size + 1 + offset] << 8) + n[size + offset];
            size += 2;
            addr += size + offset;
            str += addr.toString(16).padStart(4,'0');
            args.set('isFar', false);
            args.set('addr', addr);
        }
        else if(n[offset] == 0x9A){
            let addr = (n[size + 1 + offset] << 8) + n[size + offset];
            let segm = (n[size + 3 + offset] << 8) + n[size + 2 + offset];
            size += 4;
            str += segm.toString(16).padStart(4,'0')  + ":" + addr.toString(16).padStart(4,'0');
            args.set('isFar', true);
            args.set('addr', addr);
            args.set('seg', segm);
        }
        else if(n[offset] == 0xFF && (n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})010(?<rm>[01]{3})/) != null || n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})011(?<rm>[01]{3})/) != null )){
            args.set('isFar', n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})011(?<rm>[01]{3})/) != null);
            args.set('isFF', true);
            let rm = (config.get('rm') as RM);
            let mod = (config.get('mod') as Mod);
            let rmn = rm?.Name ?? "???";
            size += 1;
            if (mod?.Value === 1) {
                let suffix = n[size + offset].toString(16).padStart(2, '0');
                size += 1;
                rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                args.set('suffix', n[size + offset]);
            }
            if (mod?.Value === 2) {
                let suffix = n[size + 1 + offset].toString(16).padStart(2, '0')
                    + n[size + offset].toString(16).padStart(2, '0')
                size += 2;
                args.set('suffix', (n[size+1+offset] << 8) + n[size+offset]);
                rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
            }
            if (mod?.Value === 3) {
                let w = config.get('w');
                let reg: Registers = (w == Sizes.b ? Registers.Reg8 : Registers.Reg16).find(x => x.RegBit == rm.Value);
                args.set('suffix', reg);
                rmn = reg.Name;
            }
            if (rm?.Value === 6 && mod?.Value === 0) {
                rmn = "[" + n[size + 1 + offset]?.toString(16).padStart(2, '0') + n[size+offset]?.toString(16).padStart(2, '0') + "]";
                args.set('ram', (n[size+1+offset] << 8) + n[size]);
                size += 2;
            }
            str += rmn;
        }
        else {
            if (config.has('mod')) {
                size += 1;
                let rm = (config.get('rm') as RM);
                let mod = (config.get('mod') as Mod);
                let rmn = rm.Name;
                args.set('suffix', 0);
                if (mod.Value == 1) {
                    let suffix = n[size + offset].toString(16).padStart(2, '0');
                    size += 1;
                    rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                    args.set('suffix', n[size + offset]);
                }
                if (mod.Value == 2) {
                    let suffix = n[size + 1 + offset].toString(16).padStart(2, '0')
                        + n[size + offset].toString(16).padStart(2, '0')
                    size += 2;
                    args.set('suffix', (n[size+1+offset] << 8) + n[size+offset]);
                    rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                }
                if (mod.Value == 3) {
                    let w = config.get('w');
                    let reg: Registers = (w == Sizes.b ? Registers.Reg8 : Registers.Reg16).find(x => x.RegBit == rm.Value);
                    args.set('suffix', reg);
                    rmn = reg.Name;
                }
                if (rm.Value == 6 && mod.Value == 0) {
                    rmn = "[" + n[size + 1 + offset]?.toString(16).padStart(2, '0') + n[size+offset]?.toString(16).padStart(2, '0') + "]";
                    args.set('ram', (n[size+1+offset] << 8) + n[size]);
                    size += 2;
                }
                if (config.has('s')) {
                    if (config.get('w') && config.get('s') == 0) {
                        str += rmn;
                        str += ", ";
                        str += n[size + 1 + offset]?.toString(16).padStart(2, '0') + n[size + offset]?.toString(16).padStart(2, '0');
                        args.set('sv', (n[size + 1 + offset] << 8) | n[size +offset]);

                        args.set('ss', Sizes.w);
                        size += 2;
                    } else {
                        str += rmn;
                        str += ", ";
                        str += n[size + offset]?.toString(16).padStart(2, '0');
                        args.set('sv', n[size + offset]);
                        args.set('ss', Sizes.b);
                        size += 1;
                    }
                } else {
                    args.set('sv', config.get('reg'));
                    if (config.has('d') && config.get('d')) {
                        str += (config.get('reg') as Registers).Name;
                        str += ", ";
                        str += rmn;
                    } else {
                        str += rmn;
                        if(config.has('reg')){
                            str += ", ";
                            str += (config.get('reg') as Registers).Name;
                        }
                    }
                }
            }
            else if(config.has('reg')){
                str = config.get('reg').Name;
            }
            else if (config.has('w')) {
                if (config.get('w')) {
                    str = "AX, " + n[size + 1 + offset]?.toString(16).padStart(2, '0') + n[size + offset]?.toString(16).padStart(2, '0');
                    size += 2;
                    args.set('wv',  (n[size + 1 + offset] << 8) + n[size + offset])
                } else {
                    str = "AL, " + n[size + offset]?.toString(16).padStart(2, '0');
                    size += 1;
                    args.set('wv', n[size + offset]);
                }
            }

        }
        if(size < this.#bins.length) size = this.#bins.length;
        for (let i = 0; i < size; i++) {
                if (n[i + offset]) {
                    bytes.push(n[i + offset]);
                } else {
                    bytes.push(0)
                }
            }

        return {
            asm: this.#name + " " + str,
            size: size,
            bytes: bytes,
            args: args
        };
    }
    getGroups(n:number[], offset = 0, replace = true):Map<string, any>{
        let d:Map<string, any> = new Map<string, any>();
        this.#bins.forEach((x, i) => {
            let bin = (n[i + offset] ?? 0).toString(2).padStart(8, '0');
            let gr = bin.match(x)?.groups;
            if(gr)
            for(let k in gr){
                d.set(k, parseInt(gr[k], 2))
            }
        });
        if(replace) {
            if (d.has("mod")) {
                let x = Mod.ALL.find(x => x.Value == d.get("mod"));
                d.set("mod", x);
            }
            if (d.has("rm")) {
                let x = RM.ALL.find(rm => rm.Value == d.get("rm"));
                d.set("rm", x);
            }
            if (d.has("reg")) {
                let w = d.get("w");
                let v = d.get("reg");
                let reg: Registers[] = w == Sizes.b ? Registers.Reg8 : Registers.Reg16;
                d.set("reg", reg.find(x => x.RegBit == v));
            }
        }
        return d;
    }
    run(cpu:Cpu, n:number[], offset = 0){
        let args: Map<string, any> = this.getGroups(n, offset);
        let asm = this.asASM(n, offset);
        if(asm.args){
            asm.args.forEach((v, k) => {
                args.set(k, v);
            });
        }
        if(this.#run)
            this.#run(cpu, args);
    }
}
export const AAA = new Instruction("AAA",/AAA/, [/00110111/], (cpu) => {
    if((cpu.AL.Value & 0x0F) > 9 || cpu.AF.Value){
        cpu.AL.Value += 0x06;
        cpu.AH.Value += 1;
        cpu.CF.Value = cpu.AF.Value = true;
    }
    else {
        cpu.CF.Value = cpu.AF.Value = false;
    }
})
export const AAD = new Instruction("AAD",/AAD/, [/11010101/, /00001010/], (cpu) => {
    let result = cpu.AH.Value * 10 + cpu.AL.Value;
    cpu.AL.Value = result;
    cpu.AH.Value = 0
    cpu.ZF.Value = result == 0;
    cpu.PF.Value = checkParity(result);
    cpu.SF.Num = result & 0x80;
});
export const AAM = new Instruction("AAM", /AAM/, [/11010100/, /00001010/], (cpu) => {
    const base = 10;
    const value = cpu.AL.Value;
    let result  = cpu.AL.Value = Math.floor(value / base);
    cpu.AH.Value = value % base;
    cpu.ZF.Value = result == 0;
    cpu.PF.Value = checkParity(result);
    cpu.SF.Num = result & 0x80;
})
export const AAS = new Instruction("AAS",/AAS/, [/00111111/], (cpu) => {
    if((cpu.AL.Value & 0x0F) > 9 || cpu.AF.Value){
        cpu.AL.Value -= 0x06;
        cpu.AH.Value -= 1;
        cpu.CF.Value = cpu.AF.Value = true;
    }
    else {
        cpu.CF.Value = cpu.AF.Value = false;
    }
})
function getSrcDes(cpu:Cpu, args:Map<string,any>): { src: AddressValue, dest: AddressValue, size:Sizes }{
    let src;
    let dest;
    if (args.has('mod')) {
        let rm = (args.get('rm') as RM);
        let mod = (args.get('mod') as Mod);
        let suffix = args.get('suffix');
        let reg;
        if(args.has('s')) {
            const sv = args.get('sv');
            if(sv['Size']){
                reg = cpu.getByReg(sv as any);
                return {
                    dest:  cpu.getByRM(rm, mod, 0, reg.Size),
                    src: reg,
                    size: reg.Size
                }
            }
            else {
                const v:number = sv as any;
                return {
                    dest: cpu.getByRM(rm, mod, 0, args.get('ss')),
                    src: {
                        get Address(): number {
                            return v;
                        },
                        Value: v,
                        SValue: v,
                        get Name():string{
                            return v.toString(16);
                        }
                    },
                    size: args.get('ss')
                }
            }
        }
        else
            reg = (args.get('reg') as Registers);
        if (rm.Value == 6 && mod.Value == 0)
            suffix = args.get('ram');
        let rmn = cpu.getByRM(rm, mod, suffix, reg.Size)
        if (args.get('d') == 1) {
            dest = cpu.getByReg(reg);
            src = rmn;
        } else {
            src = cpu.getByReg(reg);
            dest = rmn;
        }

        return {dest, src, size: reg.Size};
    }
    else{
        let v = args.get('wv');
        if(args.get('w')){
            return {
                dest: cpu.getByReg(Registers.AX),
                src: {
                    get Address(): number {
                        return v;
                    },
                    Value: v,
                    get Name():string{
                        return v.toString(16);
                    }
                },
                size: args.get('ss')
            }
        }
        else {
            return {
                dest: cpu.getByReg(Registers.AL),
                src: {
                    get Address(): number {
                        return v;
                    },
                    Value: v,
                    get Name():string{
                        return v.toString(16);
                    }
                },
                size: args.get('ss')
            }
        }
    }
}
function checkADD(cpu:Cpu, dest:AddressValue, src:AddressValue, result:number, size:Sizes){
    if(size == Sizes.b){
        cpu.CF.Value = result > 0xFF ;
        cpu.AF.Value = ((dest.Value & 0xf) + (src.Value & 0xf) + cpu.CF.Num) > 0xf;
        cpu.ZF.Value = (result & 0xFF) == 0;
        cpu.SF.Value = (result & 0x80) != 0;
        cpu.OF.Value = ((dest.Value ^ result) & (src.Value ^ result) & 0x80) !== 0;
    } else{
        cpu.CF.Value = result > 0xFFFF ;
        cpu.AF.Value = ((dest.Value & 0xfff) + (src.Value & 0xfff) + cpu.CF.Num) > 0xfff;
        cpu.ZF.Value = (result & 0xFFFF) == 0;
        cpu.SF.Value = (result & 0x8000) != 0;
        cpu.OF.Value = ((dest.Value ^ result) & (src.Value ^ result) & 0x8000) !== 0;
    }
    cpu.PF.Value = checkParity(result)
}
function adc(cpu:Cpu, args:Map<string, any>){
    const  {dest, src, size} = getSrcDes(cpu, args);
    let result = dest.Value + src.Value + cpu.CF.Num;
    checkADD(cpu, dest, src, result, size)
    dest.Value = dest.Value + src.Value + cpu.CF.Num;
}
export const ADC = [
    new Instruction("ADC", /ADC 1/, [
        /000100(?<d>[01])(?<w>[01])/,
        /(?<mod>[01]{2})(?<reg>[01]{3})(?<rm>[01]{3})/], adc),
    new Instruction("ADC", /ADC 2/, [
        /100000(?<s>[01])(?<w>[01])/,
        /(?<mod>[01]{2})010(?<rm>[01]{3})/], adc),
    new Instruction("ADC", /ADC 3/, [/0001010(?<w>[01])/], adc)

];
function add(cpu:Cpu, args:Map<string, any>){
    const  {dest, src, size} = getSrcDes(cpu, args);
    let result = dest.Value + src.Value;
    checkADD(cpu, dest, src, result, size);
    dest.Value = dest.Value + src.Value;
}
export const ADD = [
    new Instruction("ADD", /ADD 1/, [
        /000000(?<d>[01])(?<w>[01])/,
        /(?<mod>[01]{2})(?<reg>[01]{3})(?<rm>[01]{3})/], add),
    new Instruction("ADD", /ADD 2/, [
        /100000(?<s>[01])(?<w>[01])/,
        /(?<mod>[01]{2})000(?<rm>[01]{3})/], add),
    new Instruction("ADD", /ADD 3/, [/0000010(?<w>[01])/], add)
];
function and(cpu:Cpu, args:Map<string, any>){
    const  {dest, src, size} = getSrcDes(cpu, args);
    let result = dest.Value & src.Value;
    this.CF.Value = false;
    this.ZF.Value = result === 0
    if(size == Sizes.b) {
        this.SF.Value = (result & 0x80) !== 0;
    }
    else {
        this.SF.Value = (result & 0x8000) !== 0;
    }
    this.PF.Value = checkParity(result);
    this.OF.Value = false;
    dest.Value = result;
}
export const AND = [
    new Instruction("AND", /AND 1/, [ /001000(?<d>[01])(?<w>[01])/,
        /(?<mod>[01]{2})(?<reg>[01]{3})(?<rm>[01]{3})/], and),
    new Instruction("AND", /AND 2/, [
        /100000(?<s>[01])(?<w>[01])/,
        /(?<mod>[01]{2})100(?<rm>[01]{3})/], and),
    new Instruction("AND", /AND 3/, [/0010010(?<w>[01])/], and)
];
function call(cpu, args:Map<string, any>){
    if(args.has('mod')){
        let rm = (args.get('rm') as RM);
        let mod = (args.get('mod') as Mod);
        let a = cpu.getByRM(rm, mod, 0, args.has('isFar') && args.get('isFar')? Sizes.d: Sizes.w);
        if (args.has('isFar') && args.get('isFar')) {
            cpu.SP.Value -= 2;
            let segs = [a >> 16 & 0xFF, (a >> 24) & 0xFF];
            cpu.setMEM(cpu.SP.Value, cpu.SS.Value, segs)
        }
        cpu.SP.Value -= 2;
        let addrs = [a & 0xFF, (a >> 8) & 0xFF];
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, addrs)
    }
    else {
        if (args.has('isFar') && args.get('isFar')) {
            cpu.SP.Value -= 2;
            let seg = args.get('seg');
            let segs = [seg & 0xFF, (seg >> 8) & 0xFF];
            cpu.setMEM(cpu.SP.Value, cpu.SS.Value, segs)
        }
        cpu.SP.Value -= 2;
        let addr = args.get('addr');
        let addrs = [addr & 0xFF, (addr >> 8) & 0xFF];
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, addrs)
    }

}
export const CALL = [
    new Instruction("CALL", /CALL 1/, [
        /11101000/], call),
    new Instruction("CALL", /CALL 2/, [
        /11111111/, /(?<mod>[01]{2})010(?<rm>[01]{3})/], call),
    new Instruction("CALL FAR", /CALL FAR 1/, [
        /10011010/], call),
    new Instruction("CALL FAR", /CALL FAR 2/, [
        /11111111/, /(?<mod>[01]{2})011(?<rm>[01]{3})/], call), //TODO BUG NOT Find
];
function cbw(cpu){
    if(cpu.AL.Value < 0x80) cpu.AH.Value = 0;
    else cpu.AH.Value = 0xFF;
}
export const CBW = new Instruction("CBW", /CBW/, [/10011000/], cbw)
function clc(cpu){
    cpu.CF.Value = false;
}
export const CLC = new Instruction("CLC", /CLC/, [/11111000/], clc)
function cld(cpu){
    cpu.DF.Value = false;
}
export const CLD = new Instruction("CLD", /CLD/, [/11111100/], cld)
function cli(cpu){
    cpu.IF.Value = false;
}
export const CLI = new Instruction("CLI", /CLI/, [/11111010/], cli)
function cmc(cpu){
    cpu.CF.Value = !cpu.CF.Value;
}
export const CMC = new Instruction("CMC", /CMC/, [/11110101/], cmc)
function cmp(cpu:Cpu, args:Map<string, any>){
    const  {dest, src, size} = getSrcDes(cpu, args);
    let result = dest.Value + src.Value;
    checkADD(cpu, dest, src, result, size);
    cpu.CF.Value = dest < src;
    cpu.ZF.Value = result == 0;
    cpu.SF.Value = result < 0;
    cpu.OF.Value = Boolean((result ^ dest.Value) & (dest.Value ^ src.Value) & (size === Sizes.b ? 0x80 : 0x8000))
    cpu.PF.Value = checkParity(result);
    cpu.AF.Value = ((dest.Value & 0xf) + (src.Value & 0xf) + cpu.CF.Num) > 0xf;

}
export const CMP = [
    new Instruction("CMP", /CMP 1/, [ /001110(?<d>[01])(?<w>[01])/,
        /(?<mod>[01]{2})(?<reg>[01]{3})(?<rm>[01]{3})/], cmp),
    new Instruction("CMP", /CMP 2/, [
        /100000(?<s>[01])(?<w>[01])/,
        /(?<mod>[01]{2})111(?<rm>[01]{3})/], cmp),
    new Instruction("CMP", /CMP 3/, [/0011110(?<w>[01])/], cmp)
];
function cmpsb(cpu){
    cpu.AL.Value = cpu.getMEM(this.SI.Value, this.DS.Value, Sizes.b).Value;
    cpu.AH.Value = cpu.getMEM(this.DI.Value, this.ES.Value, Sizes.b).Value
    const res = cpu.AL.Value - cpu.AH.Value;
    cpu.SI.Value++;
    cpu.DI.Value++;
    cpu.CF.Value = res < 0;
    cpu.ZF.Value = res == 0;
    cpu.SF.Value = res < 0;
    cpu.OF.Value = Boolean((res ^ cpu.AL.Value) & (cpu.AL.Value ^ cpu.AH.Value) & 0x80);
    cpu.PF.Value = checkParity(res);
    cpu.AF.Value = ((cpu.AL.Value & 0xf) + ( cpu.AH.Value & 0xf) + cpu.CF.Num) > 0xf;
}
function cmpsw(cpu){
    cpu.AX.Value = cpu.getMEM(this.SI.Value, this.DS.Value, Sizes.w).Value;
    cpu.BX.Value = cpu.getMEM(this.DI.Value, this.ES.Value, Sizes.w).Value
    const res = cpu.AX.Value - cpu.BX.Value;
    cpu.SI.Value++;
    cpu.DI.Value++;
    cpu.CF.Value = res < 0;
    cpu.ZF.Value = res == 0;
    cpu.SF.Value = res < 0;
    cpu.OF.Value = Boolean((res ^ cpu.AX.Value) & (cpu.AX.Value ^ cpu.BX.Value) & 0x8000);
    cpu.PF.Value = checkParity(res);
    cpu.AF.Value = ((cpu.AX.Value & 0xf) + ( cpu.BX.Value & 0xf) + cpu.CF.Num) > 0xf;
}
export const CMPSB = new Instruction("CMPSB", /CMPSB/, [/10100110/], cmpsb)
export const CMPSW = new Instruction("CMPSW", /CMPSW/, [/10100111/], cmpsw)
function daa(cpu){

    if ((cpu.AL.Value & 0x0F) > 9 || cpu.AF.Value) {
        cpu.AL.Value += 6;
        cpu.AF.Value = true;
    }

    // Handle carry from the least significant nibble to the most significant nibble
    if ((cpu.AL.Value & 0x9F) || cpu.CF.Value  ) {
        cpu.AL.Value += 0x60;
        cpu.CF.Value = true;
    }

    cpu.ZF.Value = cpu.AL.Value === 0;
    cpu.SF.Value = (cpu.AL.Value & 0x80) !== 0;
    cpu.PF.Value = checkParity(cpu.AL.Value)
}
export const DAA = new Instruction("DAA", /DAA/, [/00100111/], daa);
function das(cpu){
    if ((cpu.AL.Value & 0x0F) > 9 || cpu.AF.Value) {
        cpu.AL.Value -= 6;
        cpu.AF.Value = true;
    }

    // Handle carry from the least significant nibble to the most significant nibble
    if ((cpu.AL.Value & 0x9F) || cpu.CF.Value  ) {
        cpu.AL.Value -= 0x60;
        cpu.CF.Value = true;
    }

    cpu.ZF.Value = cpu.AL.Value === 0;
    cpu.SF.Value = (cpu.AL.Value & 0x80) !== 0;
    cpu.PF.Value = checkParity(cpu.AL.Value)
}
export const DAS = new Instruction("DAS", /DAS/, [/00101111/], das)
function dec(cpu, args){
    let dest:AddressValue;
    let size:Sizes;
    if(args.has('w')) {
        dest = cpu.getByRM(args.get('rm'), args.get('mod'), args.get('suffix'), args.get('w') ? Sizes.w : Sizes.b);
        size = args.get('w') ? Sizes.w : Sizes.b;
    }
    else
    {
        dest = args.get('reg');
        size = args.get('reg').Size;
    }

    dest.Value += -1;
    cpu.AF.Value = (dest.Value & 0x0F) === 0x0F;
    cpu.PF.Value = checkParity(dest.Value);
    cpu.ZF.Value = dest.Value == 0;
    if(size == Sizes.b){
        cpu.OF.Value = dest.Value === 0x7F;
        cpu.SF.Value = (dest.Value & 0x80) !== 0;
    }
    else {
        cpu.OF = dest.Value = 0x7FFF;
        cpu.SF.Value = (dest.Value & 0x8000) !== 0;
    }
}
export const DEC = [
    new Instruction("DEC", /DEC 1/,  [/1111111(?<w>[01])/,
        /(?<mod>[01]{2})001(?<rm>[01]{3})/], dec),
    new Instruction("DEC", /DEC 2/,  [/01001(?<reg>[01]{3})/], dec),
]

function div(cpu, args){
    let src = cpu.getByRM(args.get('rm'), args.get('mod'), args.get('suffix'), args.get('w') ? Sizes.w : Sizes.b);
    let size = args.get('w') ? Sizes.w : Sizes.b;
    let NUMR:number, DIVR = src, QUO, REM, MAX;
    if(size == Sizes.b){
        NUMR = cpu.AX.Value;
        QUO = cpu.AL;
        REM = cpu.AH;
        MAX = 0xFF;
    }
    else {
        NUMR = (cpu.DX.Value << 8) | cpu.AX.Value;
        QUO = cpu.AX;
        REM = cpu.DX;
        MAX = 0xFFFF;
    }
    let temp = NUMR;
    if(DIVR.Value ==  0 || Math.floor(temp/ DIVR.Value) > MAX){
        throw Error("DIV 0"); //TODO Internal Function For Exception
        // //Iternal Function What ??
        // cpu.SP.Value -= 2;
        // let flags = cpu.FLAGS.Value;
        // cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [flags & 0xFF, flags >> 8 ]);
        // cpu.IF.Value = false;
        // cpu.TF.Value = false;
        // cpu.SP.Value -= 2;
        // let cs = cpu.CS.Value;
        // cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [cs & 0xFF, cs >> 8]);

    }
    QUO.Value = Math.floor(temp / DIVR.Value);
    REM.Value = temp % DIVR.Value;
}
export const DIV = new Instruction("DIV", /DIV 1/, [/1111011(?<w>[01])/,
    /(?<mod>[01]{2})110(?<rm>[01]{3})/], div)

function hlt(cpu) {
    cpu.toHalt();
}
export const HLT = new Instruction("HLT", /HLT/, [/11110100/] , hlt)

function idiv(cpu, args){
    //TODO IDIV How Work
    let src = cpu.getByRM(args.get('rm'), args.get('mod'), args.get('suffix'), args.get('w') ? Sizes.w : Sizes.b);
    let size = args.get('w') ? Sizes.w : Sizes.b;
    const NUMR = 0;
    const DIVR = 1;
    const TMP = 2;
    let buffer = size == Sizes.w ? new Uint16Array(3) : new Uint8Array(3);
    let sbuffer = size == Sizes.w ? new Int16Array(buffer.buffer) : new Int8Array(buffer.buffer);
    buffer[DIVR] = src.Value;
    let QUO, REM, MAX;

    if(size == Sizes.b){
        buffer[NUMR] = cpu.AX.Value;
        QUO = cpu.AL;
        REM = cpu.AH;
        MAX = 0x7F;
    }
    else {
        buffer[NUMR] = (cpu.DX.Value << 8) | cpu.AX.Value;
        QUO = cpu.AX;
        REM = cpu.DX;
        MAX = 0x7FFF;
    }

    sbuffer[TMP] = sbuffer[NUMR];
    if(sbuffer[DIVR] == 0)   throw Error("DIV 0");
    let t  =  Math.floor(sbuffer[NUMR] / sbuffer[DIVR]);
    if((t > MAX && t > 0) || (t < 0 - MAX - 1 && t < 0 ) ){
        throw Error("DIV 0"); //TODO Internal Function For Exception
    }
    QUO.Value = Math.floor(sbuffer[NUMR] / sbuffer[DIVR]);
    sbuffer[TMP] = sbuffer[NUMR] % sbuffer[DIVR];
    REM.Value = buffer[TMP];
}
export const IDIV = new Instruction("IDIV", /IDIV 1/, [/1111011(?<w>[01])/,
    /(?<mod>[01]{2})111(?<rm>[01]{3})/], idiv)



///ESC ===
function esc(cpu, args){
    //TODO Escape
    console.log("ESC", args);
}
export const ESC = new Instruction("ESC", /ESC 1/, [/11011(?<x>[01]{3})/,   /(?<mod>[01]{2})(?<x>[01]{3})(?<rm>[01]{3})/], esc)
export const Instructions = Instruction.getInstructions();
