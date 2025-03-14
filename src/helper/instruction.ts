import {ACPU} from "../devices/cpu/acpu";
export type Config =  {asm?:string, bin?:string, arg?:any};
export type InstructionConfig = {[key: string]:Config};
export type RawConfig = {[key: string]:string};
export type InstructionFrom = string|InstructionConfig|string[]|number[];
export interface IInstruction<CPU extends ACPU> {
    get asm(): string;
    get bin(): string[];
    get hex(): string[];
    get dec(): number[];
    get config(): InstructionConfig;
    get size(): number;
    exec(cpu: CPU):void;
}
export interface ISetInstruction<CPU extends ACPU>{
   get binReg():InstructionSet[];
   get asmReg():InstructionSet[];
   config(from?: InstructionFrom): InstructionConfig|undefined;
   config(cpu:CPU, offset?:number): InstructionConfig|undefined;
   test(from: InstructionFrom):boolean;
   test(cpu:CPU, offset?:number):boolean;
   instruction(from:InstructionFrom):IInstruction<CPU>|undefined;
   instruction(cpu:CPU, offset?:number):IInstruction<CPU>|undefined;
}
export class InstructionSet {
    private _str:string[];
    private _reg:RegExp[]|undefined;
    private _config:RawConfig;
    private _flag:string = '';
    constructor(str:string[], config?:RawConfig) {
        if(!config)
            this._config = {};
        else
            this._config = config;
        this._str = str;
        this._flag = "";
    }
    reset(flag?:string){
        this._reg = undefined;
        this._flag = flag ?? "";
    }
    get str():String[] {
        return this._str.map(s => s.toString());
    }
    get reg():RegExp[]{
        if(this._reg == undefined){
            this._reg = this._str.map(s => new RegExp('^\\s*'+s+'\\s*$', this._flag));
        }
        return this._reg;
    }
    get size(): number{
        return this._str.length;
    }
    test(lines:string[]):boolean{
        if(lines.length == 1)
        {
          //  let r = new RegExp(``);
         //   console.log(r.exec(lines[0]))

        }
        for (let i = 0; i < this.reg.length; i++) {
                try {
                    if (!this.reg[i].test(lines[i].toUpperCase()))
                        return false;
                }
                catch (e){
                    return false;
                }
        }
        return true;
    }
    config(lines:string[]): RawConfig|undefined {
        if(!this.test(lines)) return undefined;
        let config:RawConfig = {};
        for(let k in this._config){
            config[k] = this._config[k];
        }
        try {
            for (let i = 0; i < this.reg.length; i++) {
                let line = this.reg[i].exec(lines[i].toUpperCase())!;
                for(let k in line.groups){
                    config[k] = line.groups[k];
                }
            }
        }
        catch (e){
            return undefined;
        }
        return config;
    }
}


export class ConstSetInstruction<CPU extends ACPU> implements ISetInstruction<CPU> {
    private _bin:string[];
    private _asm:string;
    private _exec:(cpu:CPU)=>void;
    public static r_bin = /[01]+/;
    public static r_hex = /[0-9A-F]+/;
    constructor(bin:string[]|number[],asm:string, exec:(cpu:CPU) => void) {
        if(bin.length == 0) throw new Error("Invalid bin");
        if(typeof bin[0] == "number"){
            this._bin = bin.map(b => b.toString(2).padStart(8,'0'))
        }
        else {
            let isBin = ConstSetInstruction.r_bin.test(bin.join());
            let isHex = ConstSetInstruction.r_hex.test(bin.join().toUpperCase());
            if(isBin)
                this._bin = bin.map(b => b.toString());
            else if(isHex)
                this._bin = bin.map(s => parseInt(s.toString(), 16).toString(2).padStart(8,'0'))
            else throw new Error("Invalid bin");
        }
        this._asm = asm;
        this._exec = exec;
    }
    get binReg(): InstructionSet[] {
        return [new InstructionSet(this._bin)];
    }
    get asmReg(): InstructionSet[] {
        return [new InstructionSet([this._asm])];
    }
    config(from?: InstructionFrom|CPU, offset?:number): InstructionConfig|undefined {
        if(from){
            if(!this.test(from, offset)) return undefined;
        }
        return {
            code: {
                asm:this._asm,
                bin:this._bin.join(''),
            },
        }
    }
    instruction(from: InstructionFrom|CPU, offset?:number): IInstruction<CPU>|undefined{
        if(!this.test(from, offset)) return undefined;
        return new DefInst(this._asm, this._bin, this._exec);
    }
    test(from: InstructionFrom|CPU, offset?:number): boolean{
        const that = this;
        let set = this.binReg[0];
        if(from instanceof ACPU){
            offset = offset ?? 0;
            let data = [];
            for(let i=0; i< set.str.length;i++){
                data.push(from.getMemory(offset+i));
            }
            return this.test(data as number[]);
        } //CPU
        else if(from instanceof Array) { //number[], string[]
            let bins:string[];
            try {
                if (typeof from[0] == 'number')
                    bins = from.map(t => t.toString(2).padStart(8, '0'));
                else
                    bins = from as string[];
                if (ConstSetInstruction.r_hex.test(bins[0]) && bins[0].length <= 2)
                    bins = bins.map(b => parseInt(b.toString(), 16).toString(2).padStart(8, '0'));
                return set.test(bins);
            } catch (ex:any){
                return false;
            }
        }
        else if(typeof from == 'string'){ //string
            return from == this._asm;
        }
        else {//{[p:string]:string}
            let config:InstructionConfig = from;
            if(config.code) {
                if (config.code.asm)
                    if (!this.test(config.code.asm)) return false;
                if (config.code.bin)
                    if (!this.test(config.code.bin)) return false;
            }
        }
        return true;
    }
}
export class DefInst<CPU extends ACPU> implements IInstruction<CPU>{
    private _asm:string;
    private _bin:string[];
    private _exec:(cpu:CPU)=>void;

    constructor(asm:string, bin:string[], _exec:(cpu:CPU)=>void) {
        this._asm = asm;
        this._bin = bin;
        this._exec = _exec.bind(this);
    }

    get asm(): string {
        return this._asm.toUpperCase();
    }
    get bin(): string[] {
        return this._bin.map(b => b.toString());
    }
    get config(): InstructionConfig {
        return {
           code: {
               asm:this._asm,
               bin:this._bin.join('')
           }
        };
    }
    get dec(): number[] {
        return this.bin.map(b => parseInt(b,2));
    }
    exec(cpu: CPU): void {
        this._exec(cpu);
    }
    get hex(): string[] {
        return this.dec.map(b => b.toString(16).padStart(2, '0'));
    }
    get size(): number {
        return this._bin.length;
    }
}