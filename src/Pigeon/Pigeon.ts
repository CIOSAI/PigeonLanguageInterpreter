import grammar from "./grammar.ohm?raw";
import * as ohm from "ohm-js";
import {
  PigeonType,
  PigeonPrimitive,
  PigeonComplexType,
  PigeonArrayType,
  PigeonLambdaType,
  TypeBool,
  TypeInt,
  TypeFloat,
  TypeNull,
  TypeString,
} from "./Type";
import { PigeonContext, PigeonContextStack } from "./Context";

interface PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
}

class PigeonLiteral implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: any;

  constructor(value: any, type: PigeonType) {
    this.value = value;
    this.type = (_) => type;
  }
}

class PigeonIdentifier implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: string;

  constructor(value: string) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(value);

      if (search) {
        if (search[0]) {
          return search[0].data.type(contexts);
        } else {
          return new PigeonPrimitive("Unknown");
        }
      }
      return new PigeonPrimitive("Unknown");
    };
  }
}

class PigeonTuple implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: PigeonNode[];

  constructor(value: any[]) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) =>
      new PigeonComplexType(
        "Tuple",
        value.map((v) => v.type(contexts))
      );
  }
}

class PigeonArray implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: any[];
  onItemTypeInconsistent: (types: PigeonType[]) => void = () => {};
  onNestedUnknownContent: () => void = () => {};

  constructor(value: any[]) {
    this.value = value;
    //Array<SomeType>
    //Array<Unknown> - empty array
    //Emit error if array contains different types
    //Emit error if array contains Array<Unknown>
    let unknownTypeArray = new PigeonArrayType(new PigeonPrimitive("Unknown"));
    this.type = (contexts: PigeonContextStack) => {
      if (this.value.length == 0) {
        return unknownTypeArray;
      } else {
        let type = this.value[0].type(contexts);
        for (let i = 1; i < this.value.length; i++) {
          if (this.value[i].type(contexts).equals(unknownTypeArray)) {
            this.onNestedUnknownContent();
            return unknownTypeArray;
          }
          if (!type.equals(this.value[i].type(contexts))) {
            this.onItemTypeInconsistent(
              Array.from(new Set(this.value.map((v) => v.type(contexts))))
            );
            return unknownTypeArray;
          }
        }
        return new PigeonArrayType(type);
      }
    };
  }
}

class PigeonFunctionCall implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  iden: PigeonIdentifier;
  args: Array<PigeonNode>;

  constructor(iden: PigeonIdentifier, args: Array<PigeonNode>) {
    this.iden = iden;
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(iden.value);
      if (search) {
        if (search.length != 0) {
          for (let targetData of search) {
            let target = targetData.data;
            if (!(target instanceof PigeonLambda)) continue;
            let lambda = target as PigeonLambda;
            if (
              lambda.args.every((arg, i) =>
                arg.type.includes(i in args ? args[i].type(contexts) : TypeNull)
              )
            ) {
              return lambda.type(contexts).args[1];
            } else {
              continue;
            }
          }
          console.log("No matching inputs found");
          console.log("received input: " + args.map((a) => a.type(contexts)));
          console.log(
            "expected input: " + search.map((s) => s.data.type(contexts))
          );
          return new PigeonPrimitive("Unknown");
        } else {
          return new PigeonPrimitive("Unknown");
        }
      }
      console.log("No matching function name found");
      return new PigeonPrimitive("Unknown");
    };
  }
}

class PigeonLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  args: { name: string; type: PigeonType }[];
  body: PigeonNode;

  constructor(args: { name: string; type: PigeonType }[], body: PigeonNode) {
    this.args = args;
    this.body = body;
    this.type = (contexts: PigeonContextStack) => {
      let localScope = new PigeonContext();
      for (let arg of args) {
        localScope.add(arg.name, {
          mut: true,
          data: new PigeonLiteral(null, arg.type),
        });
      }
      contexts.push(localScope);

      let lambdaType = new PigeonLambdaType(
        this.args.map((param) => param.type),
        this.body.type(contexts)
      );
      contexts.pop();
      return lambdaType;
    };
  }
}

class Pigeon {
  onItemTypeInconsistent: (types: PigeonType[]) => void = () => {};
  onNestedUnknownContent: () => void = () => {};

  parser: ohm.Grammar;
  semantic: ohm.Semantics;
  contexts: PigeonContextStack = new PigeonContextStack();

  constructor(source_grammar: string) {
    let contexts = this.contexts;
    contexts.add("uwu", {
      mut: false,
      data: new PigeonLiteral("uwu", TypeString),
    });
    contexts.add("STATUS_OK", {
      mut: false,
      data: new PigeonLiteral(201, TypeInt),
    });
    contexts.add("+-~%#_/", {
      mut: false,
      data: new PigeonLiteral("+-~%#_/", TypeString),
    });
    contexts.add("天地玄黃", {
      mut: false,
      data: new PigeonLiteral(69.69, TypeFloat),
    });

    contexts.add("log", {
      mut: false,
      data: new PigeonLambda(
        [{ name: "msg", type: TypeString }],
        new PigeonLiteral(null, TypeNull)
      ),
    });
    contexts.add("+", {
      mut: false,
      data: new PigeonLambda(
        [
          { name: "a", type: TypeInt },
          { name: "b", type: TypeInt },
        ],
        new PigeonLiteral(0, TypeInt)
      ),
    });

    let createArrayNode = (items: any[]) => {
      let node = new PigeonArray(items);
      node.onItemTypeInconsistent = this.onItemTypeInconsistent;
      node.onNestedUnknownContent = this.onNestedUnknownContent;
      return node;
    };

    this.parser = ohm.grammar(source_grammar);
    this.semantic = this.parser.createSemantics();
    this.semantic.addOperation("parse", {
      Program(statements) {
        return statements.children.map((child) => {
          return child.parse();
        });
      },
      Line(statement, _) {
        return statement.parse();
      },
      Statement(node) {
        return node.parse();
      },
      FunctionCall(iden, leftBracket, args, rightBracket) {
        let items = args.asIteration().children.map((child) => child.parse());
        return new PigeonFunctionCall(iden.parse(), items);
      },
      Lambda(leftBracket, args, rightBracket, type, arrow, body) {
        let params = args.asIteration().children.map((child) => child.parse());

        // explicit typing
        // if (type.numChildren != 0) {
        //   console.log(type.child(0).parse());
        // }
        return new PigeonLambda(params, body.parse());
      },
      Input(iden, type) {
        return { name: iden.sourceString, type: type.parse() };
      },
      Declaration(action, iden, type, value) {
        // explicit typing
        // if (type.numChildren != 0) {
        //   console.log(type.child(0).parse());
        // }
        action.parse()(iden.sourceString, value.parse());
        return new PigeonLiteral(null, TypeNull);
      },
      Declarator(content) {
        let action = content.sourceString as "let" | "mut" | "set";
        if (action == "let") {
          return (name: string, value: PigeonNode) => {
            contexts.add(name, { mut: false, data: value });
          };
        } else if (action == "mut") {
          return (name: string, value: PigeonNode) => {
            contexts.add(name, { mut: true, data: value });
          };
        } else {
          return (name: string, value: PigeonNode) => {
            let result = contexts.get(name);
            if (result == undefined) return;
            if (!result[0].mut) return;
            result[0] = { mut: true, data: value };
          };
        }
      },
      Typing(colon, type) {
        return new PigeonPrimitive(type.sourceString);
      },
      Tuple(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return new PigeonTuple(items);
      },
      Array(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return createArrayNode(items);
      },
      iden(head, tail) {
        return new PigeonIdentifier(this.sourceString);
      },
      Number(neg, numeral) {
        let num = numeral.parse();
        if (neg.sourceString == "-") {
          num.value = -num.value;
        }
        return num;
      },
      Int(digits) {
        return new PigeonLiteral(parseInt(digits.sourceString), TypeInt);
      },
      Bool(node) {
        return new PigeonLiteral(node.sourceString == "TRUE", TypeBool);
      },
      Float(node) {
        return new PigeonLiteral(node.parse(), TypeFloat);
      },
      Float_startedWithDigit(whole, _, decimals) {
        return parseFloat(whole.sourceString + "." + decimals.sourceString);
      },
      Float_startedWithDot(_, decimals) {
        return parseFloat("0." + decimals.sourceString);
      },
      str(leftTick, content, rightTick) {
        let str = content.children
          .map((x) => x.parse())
          .reduce((prev, curr) => prev + curr, "");
        return new PigeonLiteral(str, TypeString);
      },
      strContent_nonEscaped(char) {
        return char.source.contents;
      },
      strContent_escaped(_, char) {
        let escaped = new Map([
          ["b", "\b"],
          ["f", "\f"],
          ["n", "\n"],
          ["r", "\r"],
          ["t", "\t"],
          ["v", "\v"],
          ["\\", "\\"],
          ["`", "`"],
        ]);
        let c = escaped.get(char.source.contents);
        return c ? c : "\\" + char.source.contents;
      },
      discard(_) {
        return new PigeonLiteral("Discard", TypeNull);
      },
      Nothing(_) {
        return new PigeonLiteral(null, TypeNull);
      },
      comment(_) {},
      end(_) {},
    } as ohm.ActionDict<any>);
  }

  legal(input: string): boolean {
    return this.parser.match(input).succeeded();
  }

  error_message(input: string): string {
    return this.parser.match(input).message ?? "";
  }

  parse(input: string) {
    let match = this.parser.match(input);
    let parsed = this.semantic(match).parse();
    // if (parsed) {
    //   console.log(parsed.type(this.contexts).toString());
    // }
    console.log(parsed);
    return parsed;
  }

  peek(name: string) {
    return this.contexts.get(name);
  }
}

function pigeonStart(): Pigeon {
  return new Pigeon(grammar);
}

export { pigeonStart, Pigeon, type PigeonNode };
