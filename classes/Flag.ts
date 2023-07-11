import Reg from "./Register";

export default class Flag{
    #name:string
    #offset: number
    #reg: Reg
    constructor(reg:Reg,config: {name:string, offset:number}) {
        this.#reg = reg;
        this.#name = config.name
        this.#offset = config.offset;
    }

    get Value():boolean{
        return (this.#reg.Value & this.#offset) > 0;
    }

    set Value(b){
        if(b)
            this.#reg.Value |= this.#offset;
        else
            this.#reg.Value &= ~this.#offset;
    }

    get Num():number{
        return this.Value ? 1 : 0;
    }

    set Num(n: number){
        this.Value = !!n;
    }
}