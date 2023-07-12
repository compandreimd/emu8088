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
        for(let i = 0; i < n.length; i++){
            if(this.#bins[i]) {
                let str = n[i + offset].toString(2).padStart(8, '0');
                let m =  str.match(this.#bins[i]);
                if(m == null){
                    t = false;
                    break;
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
                    if (config.get('d')) {
                        str += (config.get('reg') as Registers).Name;
                        str += ", ";
                        str += rmn;
                    } else {
                        str += rmn;
                        str += ", ";
                        str += (config.get('reg') as Registers).Name;
                    }
                }
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


export const Instructions = Instruction.getInstructions();
