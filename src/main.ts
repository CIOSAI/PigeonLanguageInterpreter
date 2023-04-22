import { pigeonStart } from "./Pigeon/Pigeon";
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

let sourceCode = `let hw \`hello world!\`;\nlen(hw);`;

let parsed = pg.parse(sourceCode);
if (parsed.legal) {
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
