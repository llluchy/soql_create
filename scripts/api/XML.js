// XML处理工具模块

/**
 * XML处理工具类
 * 用于处理XML数据的解析和生成
 * 基于Salesforce Inspector Reloaded的最佳实践
 */
class XML {
    /**
     * 将JavaScript对象转换为XML字符串
     * @param {Object} params - 包含name, attributes, value的对象
     * @returns {string} XML字符串
     */
    static stringify({name, attributes, value}) {
        let doc = new DOMParser().parseFromString("<" + name + attributes + "/>", "text/xml");
        
        function buildRequest(el, params) {
            if (params == null) {
                el.setAttribute("xsi:nil", "true");
            } else if (typeof params == "object") {
                for (let [key, value] of Object.entries(params)) {
                    if (key == "_") {
                        if (value == null) {
                            el.setAttribute("xsi:nil", "true");
                        } else {
                            el.textContent = value;
                        }
                    } else if (key == "$xsi:type") {
                        el.setAttribute("xsi:type", value);
                    } else if (value === undefined) {
                        // 忽略
                    } else if (Array.isArray(value)) {
                        for (let element of value) {
                            let x = doc.createElement(key);
                            buildRequest(x, element);
                            el.appendChild(x);
                        }
                    } else {
                        let x = doc.createElement(key);
                        buildRequest(x, value);
                        el.appendChild(x);
                    }
                }
            } else {
                el.textContent = params;
            }
        }
        
        buildRequest(doc.documentElement, value);
        return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(doc).replace(/ xmlns=""/g, "");
    }

    /**
     * 解析XML元素为JavaScript对象
     * @param {Element} element - XML元素
     * @returns {Object|string} 解析后的JavaScript对象或字符串
     */
    static parse(element) {
        function parseResponse(element) {
            let str = ""; // XSD简单类型值
            let obj = null; // XSD复杂类型值
            // 如果元素有子元素，它是复杂类型。否则我们假设它是简单类型。
            if (element.getAttribute("xsi:nil") == "true") {
                return null;
            }
            let type = element.getAttribute("xsi:type");
            if (type) {
                // Salesforce从不在简单类型上设置xsi:type属性。它只用于sObjects。
                obj = {
                    "$xsi:type": type
                };
            }
            for (let child = element.firstChild; child != null; child = child.nextSibling) {
                if (child instanceof CharacterData) {
                    str += child.data;
                } else if (child instanceof Element) {
                    if (obj == null) {
                        obj = {};
                    }
                    let name = child.localName;
                    let content = parseResponse(child);
                    if (name in obj) {
                        if (obj[name] instanceof Array) {
                            obj[name].push(content);
                        } else {
                            obj[name] = [obj[name], content];
                        }
                    } else {
                        obj[name] = content;
                    }
                } else {
                    throw new Error("未知的子节点类型");
                }
            }
            return obj || str;
        }
        return parseResponse(element);
    }
}

// 导出类
window.XML = XML;
