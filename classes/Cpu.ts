import {Mod, Registers, RM, Sizes} from "./Registers";
import Reg from "./Register"
import Flag from "./Flag";
import {AddressValue} from "./Utils";


export default class Cpu{
    #reg8 = new Uint8Array(28)
    #reg16 = new Uint16Array(this.#reg8.buffer);
    #ram = 256;
    #mem8 = new Uint8Array(this.#ram)
    readonly AL = new Reg(this.#reg8, Registers.AL);
    readonly AH = new Reg(this.#reg8, Registers.AH)
    readonly BL = new Reg(this.#reg8, Registers.BL)
    readonly BH = new Reg(this.#reg8, Registers.BH)
    readonly CL = new Reg(this.#reg8, Registers.CL)
    readonly CH = new Reg(this.#reg8, Registers.CH)
    readonly DL = new Reg(this.#reg8, Registers.DL)
    readonly DH = new Reg(this.#reg8, Registers.DH)
    readonly AX = new Reg(this.#reg16, Registers.AX)
    readonly BX = new Reg(this.#reg16, Registers.BX)
    readonly CX = new Reg(this.#reg16, Registers.CX)
    readonly DX = new Reg(this.#reg16, Registers.DX)
    readonly SI = new Reg(this.#reg16, Registers.SI)
    readonly DI = new Reg(this.#reg16, Registers.DI)
    readonly BP = new Reg(this.#reg16, Registers.BP)
    readonly SP = new Reg(this.#reg16, Registers.SP)
    readonly DS = new Reg(this.#reg16, Registers.DS)
    readonly ES = new Reg(this.#reg16, Registers.ES)
    readonly SS = new Reg(this.#reg16, Registers.SS)
    readonly CS = new Reg(this.#reg16, Registers.CS)
    readonly IP = new Reg(this.#reg16, Registers.IP)
    readonly #FLAGS = new Reg(this.#reg16, Registers.FLAGS)
    readonly CF = new Flag(this.#FLAGS, Registers.Flags.CF)
    readonly PF = new Flag(this.#FLAGS, Registers.Flags.PF)
    readonly AF = new Flag(this.#FLAGS, Registers.Flags.AF)
    readonly ZF = new Flag(this.#FLAGS, Registers.Flags.ZF)
    readonly SF = new Flag(this.#FLAGS, Registers.Flags.SF)
    readonly IF = new Flag(this.#FLAGS, Registers.Flags.IF)
    readonly DF = new Flag(this.#FLAGS, Registers.Flags.DF)
    readonly OF = new Flag(this.#FLAGS, Registers.Flags.OF)
    readonly ALLRegs = [
        this.AL, this.AH, this.AX,
        this.BL, this.BH, this.BX,
        this.CL, this.CH, this.CX,
        this.DL, this.DH, this.DX,
        this.SI, this.DI, this.BP, this.SP,
        this.DS, this.ES, this.CS,
    ]

    getByReg(reg:Registers):AddressValue{
        let r = this.ALLRegs.find(x => x.Reg.Offset == reg.Offset && x.Reg.Size == reg.Size);

        return r;
    }

    getByRM(rm:RM, mod:Mod, offset:number = 0, size:Sizes = Sizes.b):AddressValue{
        if(mod != Mod.REG) {
            let name = rm.Name;
            if(offset != 0){
                name = name.substring(0, name.length - 1) + '+' + offset.toString(16) +"]"
            }
            let address =   this.BX.Value + this.SI.Value + offset
            let dss = this.DS;
            switch (rm) {
                case RM.BX_SI:
                    address = this.BX.Value + this.SI.Value;
                    break;
                case RM.BX_DI:
                    address = this.BX.Value + this.DI.Value;
                    break;
                case RM.BP_SI:
                    dss = this.SS;
                    address = this.BP.Value + this.SI.Value;
                    break;
                case RM.BP_DI:
                    dss = this.SS;
                    address = this.BP.Value + this.DI.Value;
                    break;
                case RM.SI:
                    address = this.SI.Value;
                    break;
                case RM.DI:
                    address = this.DI.Value;
                    break;
                case RM.BP:
                    if(mod == Mod.ABSENT){
                        address = 0;
                    }
                    else {
                        dss = this.SS;
                        address = this.BP.Value;
                    }
                    break;
                case RM.BX:
                    address = this.BX.Value;
                    break;
            }
            let that = this;
            return {
                get Name(): string {
                    return name;
                },
                get Address(){
                    return address + offset;
                },
                get Value(){
                    return that.getMEM(address + offset, dss.Value, size)
                },
                set Value(v){
                    if(size == Sizes.b){
                        that.setMEM(address + offset, dss.Value, [v]);
                    }
                    else if(size == Sizes.w){
                        let a1 = v & 0xFF;
                        let a2 = (v >> 8) & 0xFF
                        that.setMEM(address + offset, dss.Value, [a1, a2]);
                    }
                    else if(size == Sizes.d){

                        let a1 = v & 0xFF;
                        let a2 = (v >> 8) & 0xFF;
                        let a3 = (v >> 16) & 0xFF;
                        let a4 = (v >> 24) & 0xFF;
                        that.setMEM(address + offset, dss.Value, [a1, a2, a3, a4]);
                    }
                   // that.setMEM(address + offset, 0, size, v);
                }
            };

        }
        else {
            if(size == Sizes.b){
                let reg = Registers.Reg8.find(x => x.RegBit == rm.Value);
                return this.getByReg(reg);
            }
            else {
                let reg = Registers.Reg16.find(x => x.RegBit == rm.Value);
                return this.getByReg(reg);
            }

        }
    }

    getMEM(offset:number, segment:number, size:Sizes):number{
        let saddr = offset + segment * 0x10;
        switch (size){
            case Sizes.w:
                return this.#mem8[saddr + 1] << 8 | this.#mem8[saddr];
            case Sizes.d:
                return this.#mem8[saddr + 3] << 24 | this.#mem8[saddr + 2]  << 16 | this.#mem8[saddr + 1] << 8 | this.#mem8[saddr];
            case Sizes.b:
                return this.#mem8[saddr];
        }
    }

    setMEM(offset:number, segment:number, v:number[]){
        let saddr = offset + segment * 0x10;
        for(let i = 0; i < v.length; i++){
            this.#mem8[saddr + i] = v[i];
        }
    }

   getMemLines(offset:number = 0){
        for(let i = 0; i < 16;i++){
            console.log((offset + i).toString(16).padStart(6,'0') + ":" + this.#mem8[offset + i].toString(16).padStart(2,'0'));
        }
   }
    constructor() {

    }

}