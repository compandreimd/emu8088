export default interface IEvent{
    on(name:string, event:Function):void;
    off(name:string, event?:Function):void;
    emit(name:string):void;
}
