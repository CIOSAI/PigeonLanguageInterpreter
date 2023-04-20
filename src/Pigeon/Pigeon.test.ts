import { describe, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { Pigeon } from "./Pigeon";
import {
  PigeonType,
  TypeInt,
  TypeFloat,
  TypeString,
  TypeBool,
  TypeNull,
  PigeonArrayType,
  PigeonComplexType,
  PigeonPrimitive,
} from "./Type";

describe("Pigeon Simple Data Parsing", () => {
  let grammar: string;
  let pg: Pigeon;

  beforeAll(() => {
    const filePath = path.join(__dirname, "./grammar.ohm");
    grammar = fs.readFileSync(filePath, { encoding: "utf-8" });
  });

  beforeEach(() => {
    pg = new Pigeon(grammar);
  });

  it("empty", () => {
    expect(pg.parse("")).toEqual([]);
    expect(pg.parse("\n")).toEqual([]);
    expect(pg.parse("     ")).toEqual([]);
    expect(pg.parse("//among us sus")).toEqual([]);
    expect(pg.parse("/* Did you know? In terms of...*/")).toEqual([]);
  });

  it("numbers legal", () => {
    let check = (content: string, val: any, type: PigeonType) => {
      let subject = pg.parse(content).result[0];
      expect(subject.type()).toEqual(type);
      expect(subject.value).toEqual(val);
    };
    check("69;", 69, TypeInt);
    check("-420;", -420, TypeInt);
    check("0.0;", 0.0, TypeFloat);
    check("1.;", 1, TypeFloat);
    check(".5;", 0.5, TypeFloat);
    check("-1.5;", -1.5, TypeFloat);
    check("-.5;", -0.5, TypeFloat);
  });

  it("numbers illegal", () => {
    let check = (content: string) => {
      expect(() => pg.parse(content)).toThrow();
    };
    check("69.69.69;");
    check("69.69.;");
    check(".69.69;");
    check("69..69;");
    check("0-2;");
    check("0--;");
  });

  it("strings legal", () => {
    let check = (content: string, val: string) => {
      let subject = pg.parse(content).result[0];
      expect(subject.type()).toEqual(TypeString);
      expect(subject.value).toEqual(val);
    };
    check("``;", "");
    check("`hewwo :3`;", "hewwo :3");
    check(`\`\\n\`;`, "\n");
    check(`\`\\\`\`;`, "`");
  });

  it("strings illegal", () => {
    let check = (content: string) => {
      expect(() => pg.parse(content)).toThrow();
    };
    check("`");
    check("`\\");
    check(`\`\`\`;`);
  });

  it("other literals legal", () => {
    let check = (content: string, val: any, type: PigeonType) => {
      let subject = pg.parse(content).result[0];
      expect(subject.type()).toEqual(type);
      expect(subject.value).toEqual(val);
    };
    check("TRUE;", true, TypeBool);
    check("FALSE;", false, TypeBool);
    check("null;", null, TypeNull);
  });

  it("arrays and tuples legal", () => {
    let check = (content: string, type: PigeonType) => {
      let subject = pg.parse(content).result[0];
      expect(subject.type()).toEqual(type);
    };
    check("[];", new PigeonArrayType(new PigeonPrimitive("Unknown")));
    check("[0 1 2];", new PigeonArrayType(TypeInt));
    check("[ [] []];", new PigeonArrayType(new PigeonPrimitive("Unknown")));
    check("[0\n1\n2];", new PigeonArrayType(TypeInt));
    check(
      "[[0 1] [3 4 5]];",
      new PigeonArrayType(new PigeonArrayType(TypeInt))
    );
    check("();", new PigeonComplexType("Tuple", []));
    check("(0);", new PigeonComplexType("Tuple", [TypeInt]));
    check(
      "(0 `hehe` 6.9);",
      new PigeonComplexType("Tuple", [TypeInt, TypeString, TypeFloat])
    );
    check(
      "((`bruh` 2) ());",
      new PigeonComplexType("Tuple", [
        new PigeonComplexType("Tuple", [TypeString, TypeInt]),
        new PigeonComplexType("Tuple", []),
      ])
    );
  });

  it("arrays and tuples illegal", () => {
    let check = (content: string) => {
      expect(() => pg.parse(content)).toThrow();
    };
    check("[");
    check("[0 1 2");
    check("[0 1 2;");
    check("(");
    check("(0 1 2");
    check("(0 1 2;");
  });

  it("identifiers legal", () => {
    expect(pg.parse("uwu;").legal).toBe(true);
    expect(pg.parse("STATUS_OK;").legal).toBe(true);
    expect(pg.parse("+-~%#_/;").legal).toBe(true);
    expect(pg.parse("天地玄黃;").legal).toBe(true);
  });

  it("identifiers illegal", () => {
    expect(pg.parse("hello//world;").legal).toBe(false);
    expect(pg.parse("hello/*world;").legal).toBe(false);
  });
});

describe("Pigeon Expression Parsing", () => {
  let grammar: string;
  let pg: Pigeon;

  beforeAll(() => {
    const filePath = path.join(__dirname, "./grammar.ohm");
    grammar = fs.readFileSync(filePath, { encoding: "utf-8" });
  });

  beforeEach(() => {
    pg = new Pigeon(grammar);
  });

  it("function calls", () => {});
  /*<START regular call>
log(`hewwo`);
<END>

<START empty call>
log();
<END>

<START tuple of 1 value from a call>
(b(0 1));
<END>

<START tuple with a function and a tuple>
(b (0 1));
<END>

<START call with discard>
bread( 0 _ );
<END> */
  it("lambdas legal", () => {});
  /*<START lambda inferred type>
() => log(`hewwo :3`);
<END>

<START lambda explicit type>
():Int => get_unix();
<END>

<START lambda input>
(a:String) => log(a);
<END>

<START lambda input and explicit type>
(a:Int):Int => +(a 1);
<END>*/

  it("declarations legal", () => {
    pg.parse("let hw `hello world!`;");
    expect(pg.parse("hw;").result[0].type(pg.contexts)).toEqual(TypeString);
    pg.parse("let count_len (str: String): Int => 1;");
    expect(pg.parse("count_len(hw);").result[0].type(pg.contexts)).toEqual(
      TypeInt
    );
  });

  // it("entire program", () => {
  //   expect(pg.legal("let hw `hello world!`;log(hw);")).toBe(true);
  // });
});
