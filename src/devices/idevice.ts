import { UUID, randomUUID } from "crypto";
import { ISystem } from "./system/interaces";
import AEvent from "../event/AEvent";

export enum DeviceType {
    Cpu = "Cpu",
    Memory = "Memory",
    System = "System"
}
export default interface IDevice {
    get name(): String
    get uuid(): UUID;
    get type() : DeviceType;
    get offset() : number;
    get nextOffset(): number;
    get powered():boolean;
    get size() : number;
    powerOn():void;
    powerOff():void;
    setSystem(sys: ISystem):void
}
export abstract class ADevice extends AEvent implements IDevice {
    protected _name:string
    protected _uuid:UUID
    protected _type:DeviceType
    protected _sys?: ISystem
    protected _offset: number
    protected _powered: boolean = false;
    
    constructor(name:string, type:DeviceType, offset?:number){
        super()
        this._name = name;
        this._uuid = randomUUID()
        this._type = type
        this._offset = offset ?? 0;
    }
    get nextOffset(): number {
        return 1;
    }
    get name(): String {
        return this._name;
    }
    get uuid(): UUID {
        return this._uuid;
    }
    get type(): DeviceType {
        return this._type;
    }
    get offset(){
        return this._offset;
    }
    get size(){
        return 1;
    }
    setSystem(sys: ISystem){
        this._sys = sys;
        let devices = sys.getDevices(this._type).filter(d => d !== this).sort((a, b) => b.offset - a.offset);
        if(devices.length){
            this._offset = devices[0].nextOffset;
        }
        else {
            this._offset = 0;
        }
        return this;
    }
    get powered(){
        return this._powered;
    }
    powerOn(): void {
        this.emit("powerOn")
        this._powered = true;
    }
    powerOff(): void {
        this.emit("powerOff")
        this._powered = false;
    }

}