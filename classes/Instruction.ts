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
        if(n[offset] == 0xCC){
            str = "3";
            args.set('type', 3);
        }
        else if(n[offset] == 0xCD) {
            args.set('type', 3);
            let v = n[offset + size];
            str += v.toString(10)
            size+=1;
        }
        else if(n[offset] == 0xE4 || n[offset] == 0xE5 || n[offset] == 0xEC || n[offset] == 0xED) {
            if(config.get('w')){
                str += "AX,";
                args.set('w', 1);
            }
            else {
                str += "AL,"
                args.set('w', 0);
            }
            if(config.get('p')){
                if(config.get('w')){
                    str += "DX";
                    args.set('w', 1);
                }
                else {
                    str += "DX"
                    args.set('w', 0);
                }
            }
            else {
                let v = n[offset + size];
                str += v.toString(16).padStart(2, '0');
                args.set('port', v);
                size += 1;
            }
        }
        else if((n[offset] >= 0x70 && n[offset] < 0x80) || n[offset] == 0xE3//JA .. JE, JZ, JNE
    ){
            let addr = n[size + offset];
            let sbuf = new Int8Array(1);
            let buf = new Uint8Array(sbuf.buffer);
            let sbuf2 = new Int16Array(1);
            let buf2 = new Uint16Array(sbuf2.buffer);
            size += 1;
            buf[0] = addr;
            addr = sbuf[0];
            sbuf2[0] = (offset + addr + size);
            str += buf2[0].toString(16).padStart(4,'0');
            args.set('addr', buf2[0]);
        }
        else if(n[offset] == 0xE8){
            let addr = (n[size + 1 + offset] << 8) + n[size + offset];
            size += 2;
            addr += size + offset;
            str += addr.toString(16).padStart(4,'0');
            args.set('isFar', false);
            args.set('addr', addr);
        }
        else if(n[offset] == 0xE9){
            let addr = (n[size + 1 + offset] << 8) + n[size + offset];
            size += 2;
            addr += size + offset;
            str += addr.toString(16).padStart(4,'0');
            args.set('isFar', false);
            args.set('addr', addr);
        }
        else if(n[offset] == 0xEB){
            let addr =  n[size + offset];
            size += 1;
            let buf = new Uint8Array(1);
            let sbuf = new Int8Array(buf.buffer);
            let buf2 = new Uint16Array(1);
            buf[0] = addr;
            buf2[0] = offset + size + sbuf[0];
            str += buf2[0].toString(16).padStart(4,'0');
            args.set('isFar', false);
            args.set('addr', buf2[0]);
        }
        else if(n[offset] == 0x9A || n[offset] == 0xEA){
            let addr = (n[size + 1 + offset] << 8) + n[size + offset];
            let segm = (n[size + 3 + offset] << 8) + n[size + 2 + offset];
            size += 4;
            str += segm.toString(16).padStart(4,'0')  + ":" + addr.toString(16).padStart(4,'0');
            args.set('isFar', true);
            args.set('addr', addr);
            args.set('seg', segm);
        }
        else if(n[offset] == 0xFF &&
            (
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})010(?<rm>[01]{3})/) != null ||
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})011(?<rm>[01]{3})/) != null ||
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})100(?<rm>[01]{3})/) != null ||
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})101(?<rm>[01]{3})/) != null
            )){
            args.set('isFar',
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})011(?<rm>[01]{3})/) != null ||
                n[offset + 1].toString(2).padStart(8, '0').match(/(?<mod>[01]{2})101(?<rm>[01]{3})/) != null
            );
            args.set('isFF', true);
            let rm = (config.get('rm') as RM);
            let mod = (config.get('mod') as Mod);
            let rmn = rm?.Name ?? "???";
            size += 1;
            if (mod?.Value === 1) {
                let suffix = n[size + offset].toString(16).padStart(2, '0');
                rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                args.set('suffix', n[size + offset]);
                size += 1;
            }
            if (mod?.Value === 2) {
                let suffix = n[size + 1 + offset].toString(16).padStart(2, '0')
                    + n[size + offset].toString(16).padStart(2, '0')
                args.set('suffix', (n[size+1+offset] << 8) + n[size+offset]);
                rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                size += 2;
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
                    rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                    args.set('suffix', n[size + offset]);
                    size += 1;
                }
                if (mod.Value == 2) {
                    let suffix = n[size + 1 + offset].toString(16).padStart(2, '0')
                        + n[size + offset].toString(16).padStart(2, '0')
                    args.set('suffix', (n[size+1+offset] << 8) + n[size+offset]);
                    rmn = rmn.substring(0, rmn.length - 1) + "+" + suffix + "]";
                    size += 2;
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
                    args.set('wv',  (n[size + 1 + offset] << 8) + n[size + offset])
                    size += 2;
                } else {
                    str = "AL, " + n[size + offset]?.toString(16).padStart(2, '0');
                    args.set('wv', n[size + offset]);
                    size += 1;
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
            this.#run.bind(this, cpu, args)();
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
            let o = cpu.CS.Value;
            let segs =  [o & 0xFF, (o >> 8) & 0xFF];
            cpu.setMEM(cpu.SP.Value, cpu.SS.Value, segs)
            cpu.SP.Value = (a.Value >> 16) & 0xFFFF;
        }
        cpu.SP.Value -= 2;
        let o = cpu.IP.Value;
        let addrs = [o & 0xFF, (o >> 8) & 0xFF];
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, addrs)
        cpu.IP.Value = a.Value & 0xFFFF;
    }
    else {
        if (args.has('isFar') && args.get('isFar')) {
            cpu.SP.Value -= 2;
            let o = cpu.CS.Value;
            let segs =  [o & 0xFF, (o >> 8) & 0xFF];
            cpu.setMEM(cpu.SP.Value, cpu.SS.Value, segs)
            cpu.CS.Value = args.get('seg');
        }
        cpu.SP.Value -= 2;
        let addr = args.get('addr');
        let o = cpu.IP.Value;
        let addrs = [o & 0xFF, (o >> 8) & 0xFF];
        cpu.IP.Value = addr;
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
        NUMR = (cpu.DX.Value << 16) | cpu.AX.Value;
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
    let src = cpu.getByRM(args.get('rm'), args.get('mod'), args.get('suffix'), args.get('w') ? Sizes.w : Sizes.b);
    let size = args.get('w') ? Sizes.w : Sizes.b;
    let buffer = size == Sizes.w ? new Uint16Array(2) : new Uint8Array(2);
    let sbuffer = size == Sizes.w ? new Int16Array(buffer.buffer) : new Int8Array(buffer.buffer);
    let buffer2 = size == Sizes.w ? new Uint32Array(1) : new Uint16Array(1);
    let sbuffer2 = size == Sizes.w ? new Int32Array(buffer2.buffer) : new Int16Array(buffer2.buffer);
    buffer[0] = src.Value;
    let QUO, REM, MAX;

    if(size == Sizes.b){
        buffer2[0] = cpu.AX.Value;
        QUO = cpu.AL;
        REM = cpu.AH;
    }
    else {
        buffer2[0] = (cpu.DX.Value << 16) | cpu.AX.Value;
        QUO = cpu.AX;
        REM = cpu.DX;
    }


    if(sbuffer2[0] == 0)   throw Error("DIV 0");
    let tmp = Math.floor(sbuffer2[0] / sbuffer[0]);
    if(tmp < 0) tmp++; //Fix Negative result
    sbuffer[1]  =  tmp;
    if(sbuffer[1] !== tmp ){ //Check LIMIT
        throw Error("DIV 0"); //TODO Internal Function For Exception
    }
    QUO.Value = buffer[1];
    sbuffer[0] = sbuffer2[0] % sbuffer[0]

    REM.Value = buffer[0];
}
export const IDIV = new Instruction("IDIV", /IDIV 1/, [/1111011(?<w>[01])/,
    /(?<mod>[01]{2})111(?<rm>[01]{3})/], idiv)

function imul(cpu, args){
    let src = cpu.getByRM(args.get('rm'), args.get('mod'), args.get('suffix'), args.get('w') ? Sizes.w : Sizes.b);
    let size = args.get('w') ? Sizes.w : Sizes.b;
    let buffer = size == Sizes.w ? new Uint16Array(2) : new Uint8Array(2);
    let sbuffer = size == Sizes.w ? new Int16Array(buffer.buffer) : new Int8Array(buffer.buffer);
    let buffer2 = size == Sizes.w ? new Uint32Array(1) : new Uint16Array(1);
    let sbuffer2 = size == Sizes.w ? new Int32Array(buffer2.buffer) : new Int16Array(buffer2.buffer);

    let LSRC, RSRC, DEST;
    if(size == Sizes.b){
        LSRC = cpu.AL;
        RSRC = src;
        DEST = [cpu.AH];
    }
    else{
        LSRC = cpu.AX;
        RSRC = src;
        DEST = [cpu.AX, cpu.DX];
    }
    buffer[0] = LSRC.Value;
    buffer[1] = RSRC.Value;
    sbuffer2[0] = sbuffer[0] * sbuffer[1];
    if(DEST.length == 2){
        DEST[0].Value = buffer2[0] & 0xFFFF;
        DEST[1].Value = (buffer2[0] >> 16) & 0xFFFF;
    }
    else {
        DEST[0].Value = buffer2[0];
    }
    cpu.CF.Value = sbuffer2[0] !==  sbuffer[0] * sbuffer[1];
    cpu.OF.Value = cpu.CF.Value;
}

export const IMUL = new Instruction("IMUL", /IMUL 1/, [/1111011(?<w>[01])/,
        /(?<mod>[01]{2})101(?<rm>[01]{3})/], imul)

function in_(cpu, args){
    let SRC, DEST;
    let port = args.has('p')? cpu.DX.Value :  args.get('port') ;
    if(args.has('w')){
        SRC =  cpu.OUT(port+1) << 8 | cpu.OUT(port);
        DEST = cpu.AX;
    }
    else {
        SRC = cpu.OUT(port);
        DEST = cpu.AL;
    }
    DEST.Value = SRC;
}

export const IN = new Instruction("IN", /IN 1/, [/1110(?<p>[01])10(?<w>[01])/], in_);

function inc(cpu, args){
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

    dest.Value -= -1;
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
export const INC = [new Instruction("INC", /INC 1/, [/1111111(?<w>[01])/,
    /(?<mod>[01]{2})000(?<rm>[01]{3})/], inc),
    new Instruction("INC", /INC 2/, [/01000(?<reg>[01]{3})/], inc)
]

function int(cpu, args){
    cpu.SP.Value -= 2;
    let res = cpu.FLAGS;
    cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8 ])
    cpu.IF.Value = false;
    cpu.TF.Value = false;
    cpu.SP.Value -= 2;
    res = cpu.CS.Value;
    cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8 ])
    let type = args.get('type');
    cpu.CS.Value = type * 4 + 2;
    res = cpu.IP.Value;
    cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8 ])
    cpu.IP.Value = type * 4;
}
export const INT = new Instruction("INT", /INT 1/, [/1100110(?<w>[01])/], int)

function into(cpu){
    if(cpu.OF.Value) {
        cpu.SP.Value -= 2;
        let res = cpu.FLAGS;
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8])
        cpu.IF.Value = false;
        cpu.TF.Value = false;
        cpu.SP.Value -= 2;
        res = cpu.CS.Value;
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8])
        cpu.CS.Value = 0x12;
        res = cpu.IP.Value;
        cpu.setMEM(cpu.SP.Value, cpu.SS.Value, [res & 0xFF, res >> 8])
        cpu.IP.Value = 0x10;
    }
}
export const INTO = new Instruction("INTO", /INTO 1/, [/11001110/], into)
function iret(cpu){
    cpu.IP.Value = cpu.getMEM(cpu.SP.Value, cpu.SS.Value, Sizes.w);
    cpu.SP.Value += 2;
    cpu.CS.Value = cpu.getMEM(cpu.SP.Value, cpu.SS.Value, Sizes.w);
    cpu.SP.Value += 2;
    cpu.FLAGS.Value = cpu.getMEM(cpu.SP.Value, cpu.SS.Value, Sizes.w);
    cpu.SP.Value += 2;
}
export const IRET = new Instruction("IRET", /IRET 1/, [/11001111/], iret)

function j(cpu, args){
    let b = false;
    switch(this.Name) {
        case "JA":
        case "JNBE":
            b = !(cpu.CF.Value && cpu.ZF.Value);
            break;
        case "JAE":
        case "JNB":
            b = !cpu.CF.Value;
            break;
        case "JB":
        case "JNAE":
            b = cpu.CF.Value;
            break;
        case "JBE":
        case "JNA":
            b = cpu.CF.Value || cpu.ZF.Value;
            break;
        case "JC":
            b = cpu.CF.Value;
            break;
        case "JCXZ":
            b = cpu.CX.Value == 0;
            break;
        case "JE":
        case "JZ":
            b = cpu.ZF.Value;
            break;
        case "JG":
        case "JNLE":
            b = cpu.SF.Value == cpu.OF.Value && !cpu.ZF.Value
            break;
        case "JGE":
        case "JNL":
            b = cpu.SF.Value == cpu.OF.Value
            break;
        case "JL":
        case "JNGE":
            b = cpu.SF.Value != cpu.OF.Value
            break;
        case "JLE":
        case "JNG":
            b = cpu.SF.Value != cpu.OF.Value || cpu.ZF.Value
            break;
        case "JNC":
            b = !cpu.CF.Value
            break;
        case "JNE":
        case "JNZ":
            b = !cpu.ZF.Value
            break;
        case "JNO":
            b = !cpu.OF.Value
            break;
        case "JNS":
            b = !cpu.SF.Value
            break;
        case "JNP":
        case "JPO":
            b = !cpu.PF.Value
            break;
        case "JO":
            b = cpu.OF.Value
            break;
        case "JP":
        case "JPE":
            b = cpu.PF.Value
            break;
        case "JS":
            b = cpu.SF.Value
            break;
    }
    if(b){
        cpu.IF.Value = args.get("addr");
    }

}

export const JA = new Instruction("JA", /JA 1/,    [/01110111/], j);
export const JNBE = new Instruction("JNBE", /JNBE 1/,    [/01110111/], j);
export const JNB = new Instruction("JNB", /JNB 1/,   [/01110011/], j);
export const JAE = new Instruction("JAE", /JAE 1/,   [/01110011/], j);
export const JB = new Instruction("JB", /JB 1/,      [/01110010/], j);
export const JNAE = new Instruction("JNAE", /JNAE 1/,      [/01110010/], j);
export const JBE = new Instruction("JBE", /JBE 1/,   [/01110110/], j);
export const JNA = new Instruction("JNA", /JNA 1/,   [/01110110/], j);
export const JC = new Instruction("JC", /JC 1/,      [/01110010/], j);
export const JCXZ = new Instruction("JCXZ", /JCXZ 1/,[/11100011/], j);
export const JE = new Instruction("JE", /JE 1/,[/01110100/], j);
export const JZ = new Instruction("JZ", /JZ 1/,[/01110100/], j);
export const JG = new Instruction("JG", /JG 1/,[/01111111/], j);
export const JNLE = new Instruction("JNLE", /JNLE 1/,[/01111111/], j);
export const JNL = new Instruction("JNL", /JNL 1/,[/01111101/], j);
export const JGE = new Instruction("JGE", /JGE 1/,[/01111101/], j);
export const JL = new Instruction("JL", /JL 1/,[/01111100/], j);
export const JNGE = new Instruction("JNGE", /JNGE 1/,[/01111100/], j);
export const JLE = new Instruction("JLE", /JLE 1/,[/01111110/], j);
export const JNG = new Instruction("JNG", /JNG 1/,[/01111110/], j);
export const JNC = new Instruction("JNC", /JNC 1/,[/01110011/], j);
export const JNE = new Instruction("JNE", /JNE 1/,[/01110101/], j);
export const JNZ = new Instruction("JNZ", /JNZ 1/,[/01110101/], j);
export const JNO = new Instruction("JNO", /JNO 1/,[/01110001/], j);
export const JNS = new Instruction("JNS", /JNS 1/,[/01111001/], j);
export const JNP = new Instruction("JNP", /JNP 1/,[/01111011/], j);
export const JPO = new Instruction("JPO", /JPO 1/,[/01111011/], j);
export const JO = new Instruction("JO", /JO 1/,[/01110000/], j);
export const JP = new Instruction("JP", /JP 1/,[/01111010/], j);
export const JPE = new Instruction("JPE", /JPE 1/,[/01111111/], j);
export const JS = new Instruction("JS", /JS 1/,[/01111000/], j);
function jmp(cpu, args){
    if(args.get('isFar')){
        if(args.has('mod')){
            let rm = (args.get('rm') as RM);
            let mod = (args.get('mod') as Mod);
            let a = cpu.getByRM(rm, mod, 0, Sizes.d);
            cpu.IP.Value = a & 0xFFFF;
            cpu.CS.Value = (a >> 16) & 0xFFFF;
        }
        else {
            cpu.IP.Value = args.get('addr');
            cpu.CS.Value = args.get('seg');
        }
    }
    else {
        if(args.has('mod')){
            let rm = (args.get('rm') as RM);
            let mod = (args.get('mod') as Mod);
            let a = cpu.getByRM(rm, mod, 0, Sizes.w);
            cpu.IP.Value = a;
        }
        else {
            cpu.IP.Value = args.get('addr');
        }
    }
}
export const JMP = [
    new Instruction("JMP", /JMP 1/, [/11101001/], jmp),
    new Instruction("JMP", /JMP 1/, [/11101011/], jmp),
    new Instruction("JMP", /JMP 1/, [/11101010/], jmp),
    new Instruction("JMP", /JMP 1/, [/11111111/, /(?<mod>[01]{2})100(?<rm>[01]{3})/ ], jmp),
    new Instruction("JMP", /JMP 1/, [/11111111/, /(?<mod>[01]{2})101(?<rm>[01]{3})/ ], jmp), //TODO ??SG = SG+size
]

function lahf(cpu){
    let str = `${cpu.SF.Num}${cpu.ZF.Num}0${cpu.AF.Num}0${cpu.PF.Num}1${cpu.CF.Num}`;
    cpu.AH.Value = parseInt(str, 2);
}

export const LAHF = new Instruction("LAHF", /LAHF 1/, [/10011111/], lahf)
///ESC ===
function esc(cpu, args){
    //TODO Escape
    console.log("ESC", args);
}
export const ESC = new Instruction("ESC", /ESC 1/, [/11011(?<x>[01]{3})/,   /(?<mod>[01]{2})(?<x>[01]{3})(?<rm>[01]{3})/], esc)
export const Instructions = Instruction.getInstructions();
