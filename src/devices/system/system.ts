import IDevice, { ADevice, DeviceType } from "../idevice";
import { ISystem } from "./interaces";

export default class System extends ADevice implements ISystem
{
    devices:IDevice[] = []
    constructor(name?:string){
        super(name?? "Sys", DeviceType.System);
        this.addDevice(this);
        if(!name) this._name += "_"+this._uuid.toUpperCase(); 
    }
    addDevice(device: IDevice): ISystem {
        this.emit("addDevice", device)
        this.devices.push(device);
        device.setSystem(this);
        return this;
    }
    getDevices(type: DeviceType): IDevice[] {
        return this.devices.filter(d => d.type === type);
    }
    getDevice(type:DeviceType, index:number = 0):IDevice |undefined{
        return this.devices.filter(a => a.type == type).sort((a, b) => {
            return b.offset - a.offset;
        }).find(a => a.offset - 1 < index);
    }
    powerOn(): void {
        this.devices.forEach(x => {
            if(x === this) 
                super.powerOn();
            else
                x.powerOn();
        })
    }
    powerOff(): void {
        this.devices.forEach(x => {
            if(x === this) 
                super.powerOff();
            else
                x.powerOff();
        })
    }
    reset(): void {
        this.powerOn();
        this.powerOff();
    }
}