import { ADevice, DeviceType } from "../idevice";
import { IMemory, IReadMemory } from "./interfaces";
import { ISystem } from "../system/interaces";

export default class ReadMemory extends ADevice implements IReadMemory {
    protected _data: Uint8Array = new Uint8Array(0);

    get size(): number {
        return this._data.length;
    }

    protected init(data?:Uint8Array){
        this._data = ReadMemory.copy(data);
    }
    constructor(data?: Uint8Array){
        super("ROM", DeviceType.Memory)
        this.init(data);
    }

    get(address: number): number  {
        return this._data[address];
    }
    get isWritable():boolean {
        return false;
    }

    get asWritable(): IMemory {
        if(this.isWritable) return this as any;
        else throw "Is Read only memory!"; 
    }

    static copy<T>(data?:Uint8Array):Uint8Array{
        if(data === undefined) return new Uint8Array(0);
        let output = new Uint8Array(data.byteLength);
        let outputBytes = new Uint8Array(output);
        for (var i = 0; i < data.length; i++)
            outputBytes[i] = data[i];
        return output;
    }

    set system(sys:ISystem){
        this._sys = sys;
    }

    get nextOffset(): number {
        return this._offset + this._data.length;
    }
}