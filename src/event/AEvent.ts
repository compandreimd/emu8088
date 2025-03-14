import IEvent from "./IEvent";

export default class AEvent implements IEvent {
    private _events_map: Map<string, Array<Function>> = new Map<string,  Array<Function>>;
    on(name: string, event: Function) {
        let events = this._events_map.get(name);
        if(events == undefined){
            this._events_map.set(name, [event]);
        } else
        {
            events.push(event);
        }
    }
    off(name: string, event?: Function) {
        if(event == undefined){
            this._events_map.delete(name);
        }
        else {
            let list = this._events_map.get(name);
            let index = list?.indexOf(event) ?? -2;
            if(index >= 0)
                list?.splice(index, 1)
        }
    }
    emit(name: string, ...args: any[]) {
        let events = this._events_map.get(name);
        events?.forEach(e => {
            if(args.length)
                e.apply(this, args);
            else
                e.apply(this)
        });
    }
}