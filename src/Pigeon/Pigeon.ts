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
import { PigeonData, PigeonContext, PigeonContextStack } from "./Context";

const TypeUnknown = new PigeonPrimitive("Unknown");

interface PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
}
const mutData = (content: PigeonNode) => {
  return { mut: true, data: content, evaluation: undefined };
};
const constData = (content: PigeonNode) => {
  return { mut: false, data: content, evaluation: undefined };
};

class PigeonLiteral implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  value: any;

  constructor(value: any, type: PigeonType) {
    this.value = value;
    this.type = (_) => type;
    this.eval = (_) => value;
  }
}

class PigeonIdentifier implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  value: string;

  constructor(pigeon: Pigeon, source: ohm.Node, value: string) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(value);

      if (search) {
        if (search[0]) {
          return search[0].data.type(contexts);
        } else {
          return TypeUnknown;
        }
      }
      pigeon.errorQueue.push(() => {
        pigeon.onVariableUsedBeforeDeclaration(source);
      });
      return TypeUnknown;
    };
    this.eval = (contexts) => {
      let search = contexts.get(value);
      if (search == undefined) {
        throw new Error(`Variable '${value}' used before declaration `);
      } else {
        return search[0].evaluation;
      }
    };
  }
}

class PigeonTuple implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  value: PigeonNode[];

  constructor(value: any[]) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) =>
      new PigeonComplexType(
        "Tuple",
        value.map((v) => v.type(contexts))
      );
    this.eval = (contexts) => this.value.map((x) => x.eval(contexts));
  }
}

class PigeonArray implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  value: any[];

  constructor(pigeon: Pigeon, source: ohm.Node, value: any[]) {
    this.value = value;
    let unknownTypeArray = new PigeonArrayType(TypeUnknown);
    this.type = (contexts: PigeonContextStack) => {
      if (this.value.length == 0) {
        return unknownTypeArray;
      } else {
        let type = this.value[0].type(contexts);
        for (let i = 1; i < this.value.length; i++) {
          if (this.value[i].type(contexts).equals(unknownTypeArray)) {
            pigeon.errorQueue.push(() => {
              pigeon.onNestedUnknownContent(source);
            });
            return unknownTypeArray;
          }
          if (!type.equals(this.value[i].type(contexts))) {
            pigeon.errorQueue.push(() => {
              pigeon.onItemTypeInconsistent(
                source,
                Array.from(new Set(this.value.map((v) => v.type(contexts))))
              );
            });
            return unknownTypeArray;
          }
        }
        return new PigeonArrayType(type);
      }
    };
    this.eval = (contexts) => this.value.map((x) => x.eval(contexts));
  }
}

class PigeonFunctionCall implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  iden: PigeonIdentifier;
  args: Array<PigeonNode>;

  constructor(
    pigeon: Pigeon,
    source: ohm.Node,
    iden: PigeonIdentifier,
    args: Array<PigeonNode>
  ) {
    this.iden = iden;
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(iden.value);
      if (search != undefined) {
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
          pigeon.errorQueue.push(() => {
            pigeon.onNoMatchingInputFound(
              source,
              args.map((a) => a.type(contexts)),
              (search as PigeonData[]).map(
                (s) =>
                  (s.data.type(contexts) as PigeonLambdaType)
                    .args[0] as PigeonComplexType
              )
            );
          });
          return TypeUnknown;
        } else {
          return TypeUnknown;
        }
      }
      pigeon.errorQueue.push(() => {
        pigeon.onNoMatchingFunctionName(source);
      });
      return TypeUnknown;
    };
    this.eval = (contexts) => {
      return this.iden.eval(contexts)(
        this.args.map((arg) => arg.eval(contexts))
      );
    };
  }
}

class PigeonLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  eval: (contexts: PigeonContextStack) => any;
  args: { name: string; type: PigeonType }[];
  body: PigeonNode;

  constructor(args: { name: string; type: PigeonType }[], body: PigeonNode) {
    this.args = args;
    this.body = body;
    this.type = (contexts: PigeonContextStack) => {
      let localScope = new PigeonContext();
      for (let arg of args) {
        localScope.add(arg.name, mutData(new PigeonLiteral(null, arg.type)));
      }
      contexts.push(localScope);

      let lambdaType = new PigeonLambdaType(
        this.args.map((param) => param.type),
        this.body.type(contexts)
      );
      contexts.pop();
      return lambdaType;
    };
    this.eval = (contexts) => (params: Array<any>) => {
      if (params.length != this.args.length)
        throw new Error("Invalid number of arguments");
      let localScope = new PigeonContext();
      for (let i = 0; i < args.length; i++) {
        localScope.add(this.args[i].name, {
          mut: true,
          data: new PigeonLiteral(params[i], this.args[i].type),
          evaluation: params[i],
        });
      }
      contexts.push(localScope);
      let returnedValue = this.body.eval(contexts);
      contexts.pop();
      return returnedValue;
    };
  }
}

class PigeonPrebuiltLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  eval: (contexts: PigeonContextStack) => any;
  args: PigeonType[];

  constructor(args: PigeonType[], output: PigeonType, func: Function) {
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      return new PigeonLambdaType(this.args, output);
    };
    this.eval = (contexts) => (params: Array<any>) => {
      if (params.length != this.args.length)
        throw new Error("Invalid number of arguments");
      try {
        return func(...params);
      } catch (error) {
        throw new Error("Internal error: " + error);
      }
    };
  }
}

class PigeonLet implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.parse(pigeon, iden);
    this.type = (contexts: PigeonContextStack) => TypeNull;
    this.eval = (contexts) => {
      let exist = contexts.get(this.iden);
      if (exist != undefined)
        throw new Error(`Variable '${this.iden}' already exists`);
      contexts.add(this.iden, {
        mut: false,
        data: this.value,
        evaluation: this.value.eval(contexts),
      });
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let exist = pigeon.contexts.get(this.iden);
    if (exist != undefined) {
      if (
        !(
          this.value.type(pigeon.contexts) instanceof PigeonLambdaType &&
          exist[0].data.type(pigeon.contexts) instanceof PigeonLambdaType
        )
      ) {
        pigeon.errorQueue.push(() => {
          pigeon.onVariableRedeclared(iden);
        });
        return;
      }
    }
    pigeon.contexts.add(this.iden, constData(this.value));
  }
}

class PigeonMut implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.parse(pigeon, iden);
    this.type = (contexts: PigeonContextStack) => TypeNull;
    this.eval = (contexts) => {
      let exist = contexts.get(this.iden);
      if (exist != undefined)
        throw new Error(`Variable '${this.iden}' already exists`);
      contexts.add(this.iden, {
        mut: false,
        data: this.value,
        evaluation: this.value.eval(contexts),
      });
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let exist = pigeon.contexts.get(this.iden);
    if (exist != undefined) {
      if (
        !(
          this.value.type(pigeon.contexts) instanceof PigeonLambdaType &&
          exist[0].data.type(pigeon.contexts) instanceof PigeonLambdaType
        )
      ) {
        pigeon.errorQueue.push(() => {
          pigeon.onVariableRedeclared(iden);
        });
        return;
      }
    }
    pigeon.contexts.add(this.iden, mutData(this.value));
  }
}

class PigeonSet implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => any;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.parse(pigeon, iden);
    this.type = (contexts: PigeonContextStack) => TypeNull;
    this.eval = (contexts) => {
      let result = contexts.get(this.iden);
      if (result == undefined)
        throw new Error(`Variable '${this.iden}' not found`);
      if (!result[0].mut)
        throw new Error(`Variable '${this.iden}' is immutable`);
      if (!result[0].data.type(contexts).includes(this.value.type(contexts))) {
        throw new Error(
          `Type mismatch: expected ${result[0].data
            .type(contexts)
            .toString()} but got ${this.value.type(contexts).toString()}`
        );
      }
      result[0].data = this.value.eval(contexts);
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let result = pigeon.contexts.get(this.iden);
    // set for lambda overloading not currently supported
    if (result == undefined) {
      pigeon.errorQueue.push(() => {
        pigeon.onReassignNonExistentVariable(iden);
      });
      return;
    }
    if (!result[0].mut) {
      pigeon.errorQueue.push(() => {
        pigeon.onReassignImmutableVariable(iden);
      });
      return;
    }
    if (
      !result[0].data
        .type(pigeon.contexts)
        .includes(this.value.type(pigeon.contexts))
    ) {
      pigeon.errorQueue.push(() => {
        pigeon.onTypeMismatch(
          iden,
          (result as PigeonData[])[0].data.type(pigeon.contexts),
          this.value.type(pigeon.contexts)
        );
      });
      return;
    }
    result[0] = mutData(this.value);
  }
}

class Pigeon {
  onItemTypeInconsistent: (source: ohm.Node, types: PigeonType[]) => void =
    () => {};
  onNestedUnknownContent: (source: ohm.Node) => void = () => {};
  onTypeMismatch: (
    source: ohm.Node,
    expected: PigeonType,
    received: PigeonType
  ) => void = () => {};
  onVariableRedeclared: (source: ohm.Node) => void = () => {};
  onReassignNonExistentVariable: (source: ohm.Node) => void = () => {};
  onReassignImmutableVariable: (source: ohm.Node) => void = () => {};
  onVariableUsedBeforeDeclaration: (source: ohm.Node) => void = () => {};
  onNoMatchingInputFound: (
    source: ohm.Node,
    receivedArgs: PigeonType[],
    expectedArgList: PigeonComplexType[]
  ) => void = () => {};
  onNoMatchingFunctionName: (source: ohm.Node) => void = () => {};
  onParseError: (message: string) => void = () => {};

  parser: ohm.Grammar;
  semantic: ohm.Semantics;
  contexts: PigeonContextStack = new PigeonContextStack();
  errorQueue: Array<() => void> = [];

  constructor(source_grammar: string) {
    let pigeon = this;
    // this.contexts.add("uwu", {
    //   mut: false,
    //   data: new PigeonLiteral("uwu", TypeString),
    // });
    // this.contexts.add("STATUS_OK", {
    //   mut: false,
    //   data: new PigeonLiteral(201, TypeInt),
    // });
    // this.contexts.add("+-~%#_/", {
    //   mut: false,
    //   data: new PigeonLiteral("+-~%#_/", TypeString),
    // });
    // this.contexts.add("天地玄黃", {
    //   mut: false,
    //   data: new PigeonLiteral(69.69, TypeFloat),
    // });

    let addGlobalPrebuilt = (name: string, content: PigeonNode) => {
      this.contexts.add(name, {
        mut: false,
        data: content,
        evaluation: content.eval(this.contexts),
      });
    };
    addGlobalPrebuilt(
      "len",
      new PigeonPrebuiltLambda([TypeString], TypeInt, (arg: string) => {
        return arg.length;
      })
    );

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
        return new PigeonFunctionCall(pigeon, this, iden.parse(), items);
      },
      Lambda(leftBracket, args, rightBracket, type, arrow, body) {
        let params = args.asIteration().children.map((child) => child.parse());

        let node = new PigeonLambda(params, body.parse());
        if (type.numChildren != 0) {
          let expectedReturnType = type.child(0).parse();
          if (!expectedReturnType.equals(node.type(pigeon.contexts).args[1])) {
            pigeon.errorQueue.push(() => {
              pigeon.onTypeMismatch(
                this,
                expectedReturnType,
                node.type(pigeon.contexts)
              );
            });
          }
        }
        return node;
      },
      Input(iden, type) {
        return { name: iden.sourceString, type: type.parse() };
      },
      Declaration(action, iden, type, value) {
        let data = value.parse();
        if (type.numChildren != 0) {
          let expectedType = type.child(0).parse();
          if (!expectedType.equals(data.type(pigeon.contexts))) {
            pigeon.errorQueue.push(() => {
              pigeon.onTypeMismatch(
                this,
                expectedType,
                data.type(pigeon.contexts)
              );
            });
            return new PigeonLiteral(null, TypeNull);
          }
        }
        if (action.parse() == "let") {
          return new PigeonLet(pigeon, iden, value.parse());
        } else if (action.parse() == "mut") {
          return new PigeonMut(pigeon, iden, value.parse());
        } else {
          return new PigeonSet(pigeon, iden, value.parse());
        }
      },
      Declarator(content) {
        return content.sourceString as "let" | "mut" | "set";
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

        return new PigeonArray(pigeon, this, items);
      },
      iden(head, tail) {
        return new PigeonIdentifier(pigeon, this, this.sourceString);
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

  parse(input: string): { legal: boolean; result: PigeonNode[] } {
    let match = this.parser.match(input);
    if (match.failed()) {
      this.errorQueue.push(() => {
        this.onParseError(match.message ?? "no error message");
      });
      return { legal: false, result: [] };
    }

    this.contexts.push(new PigeonContext());
    let parsed = this.semantic(match).parse();
    this.contexts.pop();

    if (this.errorQueue.length > 0) {
      this.errorQueue.forEach((x) => x());
      return { legal: false, result: [] };
    }
    return { legal: true, result: parsed };
  }

  interpret(input: {
    legal: boolean;
    result: PigeonNode[];
  }): Generator<any, void, void> {
    if (!input.legal) throw new Error("input is illegal");
    let parsed = input.result as PigeonNode[]; //result is guaranteed to be defined when input is legal
    this.contexts.push(new PigeonContext());
    let lines = parsed.map((x) => () => x.eval(this.contexts));
    function* generator() {
      for (let line of lines) {
        yield line();
      }
    }
    return generator();
  }
}

function pigeonStart(): Pigeon {
  return new Pigeon(grammar);
}

export { pigeonStart, Pigeon, type PigeonNode };
