import { RMMSet} from "../../src/devices/cpu/tcpu";
import {deepEqual} from "node:assert";
import {Config} from "../../src/helper/instruction";
enum MOD {NO_DISP, DISP, DISP2, REG}
enum RM { BX_SI, BX_DI, BP_SI, BP_DI, SI, DI, BP, BX}
enum Reg16 { AX, CX, DX, BX, SP, BP, SI, DI}
enum Reg8 { AL, CL, DL, BL, AH, CH, DH, BH}

describe('RMM configuration', () => {
    let rmm: RMMSet<any> = new RMMSet('RMM', '010010', () => {});
    let bin  = [];

    beforeEach(() => {

    });
    function asBin(n:number, s?:number):string {
        return n.toString(2).padStart(s??3, '0');
    }

    test('RMM binary', () => {
        for(let d = 0; d < 0b10; d++)
            for(let w = 0; w < 0b10; w++)
                for(let mod = 0 ; mod < 0b100; mod++)
                    for(let reg = 0 ; reg < 0b1000; reg++)
                        for(let rm = 0 ; rm < 0b1000; rm++) {
                            const check = [
                                `010010${d ? '1' : '0'}${w ? '1' : '0'}`,
                                `${asBin(mod, 2)}${asBin(reg, 3)}${asBin(rm, 3)}`
                            ];
                            const exp_raw: {code:string, d:string, w:string,
                                mod:string, reg:string, rm:string,
                                ea?:string, ea2?:string,
                                disp?:string, disp2?:string
                            }[] =  [{
                                code: '010010',
                                d: d ? '1' : '0',
                                w: w ? '1' : '0',
                                mod: asBin(mod, 2),
                                reg: asBin(reg, 3),
                                rm: asBin(rm, 3),
                            }];
                            const exp_conf:{name:Config, d:Config, w:Config,
                                mod:Config, reg:Config, rm:Config,
                                ea?:Config,
                                disp?:Config,
                            } = {
                                name: {bin:'010010', asm:'RMM'},
                                d: d ? {bin:'1', asm:'R'}: {bin:'0', asm:'L'},
                                w: w ? {bin:'1', asm:'WORD'}: {bin:'0', asm:'BYTE'},
                                mod: {bin:asBin(mod, 2), asm:MOD[mod]},
                                reg: {bin:asBin(reg, 3), asm:w ? Reg16[reg]: Reg8[reg]},
                                rm: {bin:asBin(rm, 3), asm: RM[rm].replace('_','+')},
                            };
                            if(mod == 0 && rm == 6){
                                check.push('00001010');
                                check.push('10000000');
                                exp_conf['ea'] = {
                                    bin: '800A',
                                    asm: '0000101010000000'
                                }
                                exp_raw[0]['ea'] = '00001010';
                                exp_raw[0]['ea2'] = '10000000';
                            }
                            else if(mod == 1){
                                check.push('00001010')
                                exp_raw[0]['disp'] = '00001010';
                                exp_conf.disp = {
                                    asm: '00001010',
                                    bin: '+0A'
                                }
                            }
                            else  if(mod == 2){
                                check.push('00001010')
                                check.push('10000000')
                                exp_conf.disp = {
                                    asm: '0000101010000000',
                                    bin: '800A'
                                }
                                exp_raw[0]['disp'] = '00001010';
                                exp_raw[0]['disp2'] = '10000000';
                            }
                            deepEqual(rmm.raws(check), exp_raw)
                            deepEqual(rmm.test(check), true);
                            deepEqual(rmm.config(check), exp_conf);
                            // deepEqual(rmm.config(check), {
                            //     d: {'asm': check}
                            // })
                        }
    });


    // Add more test cases targeting different CPU functionalities
});