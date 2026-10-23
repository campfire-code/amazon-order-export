// 仅供 preview.html 截图用：打开后自动用演示数据（虚构的示例商品）跑一遍完整导出流程。
export const PREVIEW = { autoRun: true } as const;
export const isPreview = () => typeof location !== 'undefined' && location.pathname.endsWith('preview.html');
