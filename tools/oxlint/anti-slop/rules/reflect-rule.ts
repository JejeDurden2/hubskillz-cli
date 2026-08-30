import { defineRule } from "@oxlint/plugins";

import { isGlobalReflectMethodCall } from "../shared/reflect-method.ts";

import type { Rule } from "@oxlint/plugins";

/** Ban one Reflect method, which bypasses ordinary typed calls and property access. */
export function reflectRule(method: string, message: string): Rule {
	return defineRule({
		meta: {
			type: "problem",
			docs: { description: `Disallow Reflect.${method}. ${message}` },
			messages: { reflectMethod: message },
		},
		createOnce(context) {
			return {
				CallExpression(node) {
					if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression")
						return;
					if (isGlobalReflectMethodCall(context.sourceCode, node.callee, method)) {
						context.report({ node, messageId: "reflectMethod" });
					}
				},
			};
		},
	});
}
