import IDevice, { DeviceType } from "../idevice"

export interface IReadMemory extends IDevice  {
    get(address:number):number
    get isWritable():boolean
    get asWritable():IMemory
}

export interface IMemory extends IReadMemory {
    set(address:number, value: number):IMemory
}
  