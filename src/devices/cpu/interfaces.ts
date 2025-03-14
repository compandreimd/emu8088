import IDevice, { DeviceType } from "../idevice"

export interface ICPU extends IDevice {
    run():void;
    pause():void;
    stop():void;
    reset():void;
    step():boolean;
    get speed():number;
    get hz():number;
    get instructions():any;
}