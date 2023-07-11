import {Registers, Sizes} from "./Registers";
import {AddressValue} from "./Utils";


export default class Reg implements AddressValue{
    #buffer:Uint16Array|Uint8Array
    #regs:Registers
    constructor(buffer:Uint16Array|Uint8Array, reg:Registers) {
        this.#buffer = buffer;
        this.#regs = reg;
    }
    get Value():number{
        return this.#buffer[this.#regs.Offset];
    }
    set Value(v){
        this.#buffer[this.#regs.Offset] = v;
    }
    get Name():string {
        return this.#regs.Name;
    }
    get Reg():Registers{
        return this.#regs;
    }
    get Address(): number {
        return this.#regs.RegBit;
    }
}
