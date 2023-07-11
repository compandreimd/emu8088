export enum Sizes {
    b,
    w,
    v,
    d,
    u
}
export class Registers {
    static readonly AL = new Registers({name:'AL', offset:0, size:Sizes.b, regBit: 0b000})
    static readonly AH = new Registers({name:'AH', offset:1, size:Sizes.b, regBit: 0b100})
    static readonly BL = new Registers({name:'BL', offset:2, size:Sizes.b, regBit: 0b011})
    static readonly BH = new Registers({name:'BH', offset:3, size:Sizes.b, regBit: 0b111})
    static readonly CL = new Registers({name:'CL', offset:4, size:Sizes.b, regBit: 0b001})
    static readonly CH = new Registers({name:'CH', offset:5, size:Sizes.b, regBit: 0b101})
    static readonly DL = new Registers({name:'DL', offset:6, size:Sizes.b, regBit: 0b010})
    static readonly DH = new Registers({name:'DH', offset:7, size:Sizes.b, regBit: 0b110})
    static readonly AX = new Registers({name:'AX', offset:0, size:Sizes.w, regBit: 0b000})
    static readonly BX = new Registers({name:'BX', offset:1, size:Sizes.w, regBit: 0b011})
    static readonly CX = new Registers({name:'CX', offset:2, size:Sizes.w, regBit: 0b001})
    static readonly DX = new Registers({name:'DX', offset:3, size:Sizes.w, regBit: 0b010})
    static readonly SI = new Registers({name:'SI', offset:4, size:Sizes.w, regBit: 0b110})
    static readonly DI = new Registers({name:'DI', offset:5, size:Sizes.w, regBit: 0b111})
    static readonly BP = new Registers({name:'BP', offset:6, size:Sizes.w, regBit: 0b101})
    static readonly SP = new Registers({name:'SP', offset:7, size:Sizes.w, regBit: 0b100})
    static readonly DS = new Registers({name:'DS', offset:8, size:Sizes.w, regBit: 0b11})
    static readonly ES = new Registers({name:'ES', offset:9, size:Sizes.w, regBit: 0b00})
    static readonly SS = new Registers({name:'SS', offset:10, size:Sizes.w, regBit: 0b10})
    static readonly CS = new Registers({name:'CS', offset:11, size:Sizes.w, regBit: 0b01})
    static readonly IP = new Registers({name:'IP', offset:12, size:Sizes.w})
    static readonly FLAGS = new Registers({name:'FLAGS', offset:13, size:Sizes.u})
    static readonly Reg8 = [Registers.AH, Registers.AL, Registers.BH, Registers.BL, Registers.CH, Registers.CL, Registers.DH, Registers.DL];
    static readonly Reg16 = [Registers.AX, Registers.BX, Registers.CX, Registers.DX, Registers.SP, Registers.BP, Registers.SI, Registers.DI];
    static readonly Seg = [Registers.ES, Registers.CS, Registers.SS, Registers.DS];
    static readonly Flags = {
        CF : {name:'CF', offset:0x0001 },
        //0x0002
        PF : {name:'PF', offset:0x0004 },
        //0x0008
        AF : {name:'AF', offset:0x0010 },
        //0x0020
        ZF : {name:'ZF', offset:0x0040 },
        SF : {name:'SF', offset:0x0080 },
        IF : {name:'IF', offset:0x0200 },
        DF : {name:'DF', offset:0x0400 },
        OF : {name:'OF', offset:0x0800 },
    }
    #name:string
    #offset:number
    #size:Sizes
    #regBit:number
    constructor(config:{name:string, offset:number, size:Sizes, regBit?:number}) {
        this.#name = config.name
        this.#offset = config.offset
        this.#size = config.size
        this.#regBit = config.regBit
    }
    get Name():string{
        return this.#name
    }
    get Offset():number{
        return this.#offset
    }
    get Size():Sizes{
        return this.#size;
    }
    get RegBit():number{
        return  this.#regBit
    }
}
export class Mod {
    #value
    #name
    constructor(name, value) {
        this.#name = name;
        this.#value = value;
    }
    get Name(){
        return this.#name;
    }
    get Value(){
        return this.#value;
    }
    static readonly ABSENT = new Mod("ABSENT", 0b00);
    static readonly LOW = new Mod("LOW", 0b01);
    static readonly HIGH = new Mod("HIGH", 0b10);
    static readonly REG = new Mod("REGISTER", 0b11);
    static readonly ALL = [Mod.ABSENT, Mod.LOW, Mod.HIGH, Mod.REG];
}
export class RM{
    #value
    #name
    get Name(){
        return this.#name;
    }
    get Value(){
        return this.#value;
    }
    constructor(name, value) {
        this.#name = name;
        this.#value = value;
    }
    static readonly BX_SI = new RM("[BX+SI]", 0b000);
    static readonly BX_DI = new RM("[BX+DI]", 0b001);
    static readonly BP_SI = new RM("[BP+SI]", 0b010);
    static readonly BP_DI = new RM("[BP+DI]", 0b011);
    static readonly SI = new RM("[SI]", 0b100);
    static readonly DI = new RM("[DI]", 0b101);
    static readonly BP = new RM("[BP]", 0b110);
    static readonly BX = new RM("[BX]", 0b111);
    static readonly ALL = [RM.BX_SI, RM.BX_DI, RM.BP_SI, RM.BP_DI, RM.SI, RM.DI, RM.BP, RM.BX]
}