import { pigeonStart } from "./Pigeon/Pigeon";
import { PigeonType, PigeonComplexType } from "./Pigeon/Type";
import * as ohm from "ohm-js";
import "./style.css";

// create a next line button on the page
let nextLine = document.createElement("button");
nextLine.innerText = "Next Line";
nextLine.onclick = () => {
  console.log("Next Line");
};
// add this element to app
document.getElementById("app")?.appendChild(nextLine);

let pg = pigeonStart();

//                                 ↓ break is supposed to be provided by "for"
let sourceCode = `for(5 \n(ind:Int break:():null):null=>{\nlog(ind);break();log(ind);\n});`;
// let sourceCode = `pop_corn((pop:():null)=>{pop();});`;
// let sourceCode = `let say69 ()=>log(69);\napply(()=>log(420));`;
// let sourceCode = `let do_smth (cb: ():null)=>cb();\nlet say69 ()=>log(69);\ndo_smth(()=>log(420));`;
// let sourceCode = `for(5 \n(ind:Int break:():null):null=>\nlog(ind)\n);`;
// let sourceCode = `(ind:Int break:():null):null=>log(1);`;
// let sourceCode = `():null=>log(1);`;

pg.onNoMatchingInputFound = (
  source: ohm.Node,
  expectedArgList: PigeonComplexType[],
  receivedArgs: PigeonType[]
) => {
  console.log("No Matching Input Found");
  console.log(source.source.getLineAndColumnMessage());
  console.log(expectedArgList.map((a) => a.toString()));
  console.log(receivedArgs.map((a) => a.toString()));
};

pg.onTypeMismatch = (
  source: ohm.Node,
  expected: PigeonType,
  received: PigeonType
) => {
  console.log("Type Mismatch");
  console.log(source.source.getLineAndColumnMessage());
  console.log(expected.toString());
  console.log(received.toString());
};

let parsed = pg.parse(sourceCode);
if (parsed.legal) {
  console.log(sourceCode);
  let result = pg.interpret(parsed);
  nextLine.onclick = () => {
    let next = result.next();
    if (next) {
      console.log(next);
      console.log(pg.contexts.stack[1].context);
    } else {
      console.log("End of program");
    }
  };
} else {
  console.log("Illegal code");
}
