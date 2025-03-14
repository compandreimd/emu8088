import IDevice, {DeviceType} from "../idevice";

export interface ISystem extends IDevice {
    addDevice(device: IDevice):ISystem
    getDevices(type: DeviceType):IDevice[]
    getDevice(type:DeviceType, index:number):IDevice |undefined
    reset():void
}