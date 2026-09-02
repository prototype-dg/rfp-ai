import { jsx as _jsx, jsxs as _jsxs } from "hono/jsx/jsx-runtime";
import { jsxRenderer } from 'hono/jsx-renderer';
export const renderer = jsxRenderer(({ children }) => {
    return (_jsxs("html", { children: [_jsx("head", { children: _jsx("link", { href: "/static/style.css", rel: "stylesheet" }) }), _jsx("body", { children: children })] }));
});
//# sourceMappingURL=renderer.js.map