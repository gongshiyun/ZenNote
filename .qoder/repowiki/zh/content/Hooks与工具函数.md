我需要先分析代码变更，然后更新文档。让我检查新增的自动更新系统相关hooks文件。

<tool_call>
<function=read_file>
<parameter=file_path>
src/hooks/useUpdater.ts
</parameter>
</function>
</tool_call>
<tool_call>
<function=read_file>
<parameter=file_path>
src/lib/updater.ts
</parameter>
</function>
</tool_call>
<tool_call>
<function=search_codebase>
<parameter=query>
useUpdater hook implementation React integration
</parameter>
<parameter=key_words>
useUpdater,updater,hook
</parameter>
<parameter=explanation>
搜索useUpdater hook的实现和React集成相关代码
</parameter>
</function>
</tool_call>