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

// let sourceCode = `for(5 \n(ind:Int break:():null):null=>{\nlog(ind);break();log(ind);\n});`;
let sourceCode = `let b TRUE;\nmut out 0;\nwhen b {set out 1;};\nout;`;

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
