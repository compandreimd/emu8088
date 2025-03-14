import {ICPU} from "./interfaces";
import {ADevice, DeviceType} from "../idevice";
import {IMemory} from "../mem/interfaces";
import {clearInterval} from "timers";
import {IInstruction, ISetInstruction} from "../../helper/instruction";

export abstract class ACPU extends ADevice implements ICPU {
    private _ticket:number = 1;
    private _step:number = 0;
    private _rId: NodeJS.Timeout|undefined = undefined;
    private _isPaused:boolean = false;
    constructor(name:string, hz?:number) {
        super(name, DeviceType.Cpu);
        if(hz)
            this._ticket = 1000/this._ticket;
    }
    run():void{
        let cpu = this;
        console.log("Run")
        if(this.isRunning){
            console.warn("Already run!")
        }
        else {
            cpu._rId = setInterval(() => {
                if(cpu._isPaused) {
                    console.warn("Is Paused!")
                }
                else {
                    if(!cpu.step()){
                        cpu.stop();
                    }
                }
            }, cpu._ticket)
        }
    }
    pause():void{
        this._isPaused = !this._isPaused;
    }
    stop():void{
        clearInterval(this._rId);
        this._rId = undefined;
    }
    reset():void{
        this._step = 0;
        this.stop();
        this._isPaused = false;
    }
    sizeMemory():number{
        let mem = this._sys?.getDevices(DeviceType.Memory) as IMemory[];
        let size= 0;
        mem?.forEach((m) => {
            size += m.size;
        })
        return size;
    }
    getMemory(offset:number):number|undefined{
        let mem =  this?._sys?.getDevice(DeviceType.Memory, offset) as IMemory;
        return mem?.get(offset - mem.offset);
    }
    getCode(offset:number):number {
        return this.getMemory(offset) ?? 0;
    }
    getInstruction(offset:number):IInstruction<ACPU>|null {
        return null;
    }
    step():boolean{
        if(this._isPaused) return true;
        if(this._step < this.sizeMemory()){
            let mem = this.getMemory(this._step);
            console.log("Step", this._step, mem);
            this._step++;
            return true;
        }
        console.log("Step", this._step++);
        return false;
    }
    get speed():number{
        return this._ticket;
    }
    get hz():number{
        return 1000/this._ticket
    }
    get isRunning():boolean{
        return !!this._rId;
    }
    powerOn() {
        super.powerOn();
        this.run();
    }
    powerOff() {
        super.powerOff();
        this.stop();
    }
    get instructions(): ISetInstruction<ACPU>[] {
        return [];
    }
}

