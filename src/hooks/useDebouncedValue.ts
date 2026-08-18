import { useEffect, useState } from "react";

/**
 * 防抖值：首次渲染立即返回当前值（保证初始展示不延迟），之后的变更在
 * delay 毫秒无新变更后才更新。用于把"全文统计/大纲解析"这类重计算从
 * 每次按键的热路径上挪走 —— 统计数字与大纲晚几百毫秒刷新是不可感知的，
 * 但打字延迟是可感知的。
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
