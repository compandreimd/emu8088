import { IMemory } from "./interfaces";
import ReadMemory from "./readMemory";

export default class Memory extends ReadMemory implements IMemory {
    protected init(data: Uint8Array): void {
        //Clean Init
        this._data = data;
    }
    constructor(data:ArrayBufferLike|number){
        super(undefined);
        this._name = "RAM";
        if(typeof data == "number"){
            this._data = new Uint8Array(data);
        }
        else {
            super.init(new Uint8Array(data));
        }
    }
    get isWritable():boolean {
        return true;
    }
    set(address: number, value: number): IMemory {
        this._data[address] = value;
        return this;
    }
}