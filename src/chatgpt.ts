import OpenAI from "openai";
import any = jasmine.any;


const openai = new OpenAI({apiKey: process.env.CHATGPT_KEY});
async function main(){
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: "intel 8088 all opcodes?" }],
        model: "gpt-4",
    });

    console.log(completion.choices[0]);
}

main().then(() => {
    console.log("END!");
});

