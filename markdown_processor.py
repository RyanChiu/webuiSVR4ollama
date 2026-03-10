# markdown_processor.py - Markdown处理和代码高亮
import markdown
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown.extensions.fenced_code import FencedCodeExtension
from markdown.extensions.tables import TableExtension
from markdown.extensions.toc import TocExtension
import re

class MarkdownProcessor:
    def __init__(self):
        # 配置Markdown扩展
        self.extensions = [
            'markdown.extensions.extra',
            'markdown.extensions.abbr',
            'markdown.extensions.attr_list',
            'markdown.extensions.def_list',
            'markdown.extensions.footnotes',
            'markdown.extensions.tables',
            'markdown.extensions.admonition',
            'markdown.extensions.smart_strong',
            'markdown.extensions.sane_lists',
            CodeHiliteExtension(
                css_class='highlight',
                linenums=False,
                guess_lang=True,
                use_pygments=True
            ),
            FencedCodeExtension(),
            TableExtension(),
            TocExtension(toc_depth='2-6')
        ]
        
        self.md = markdown.Markdown(
            extensions=self.extensions,
            output_format='html5'
        )
    
    def to_html(self, text):
        """将Markdown文本转换为HTML"""
        if not text:
            return ''
        
        try:
            # 预处理，确保代码块有正确的格式
            text = self._preprocess_code_blocks(text)
            
            # 转换Markdown为HTML
            html = self.md.convert(text)
            
            # 后处理，添加样式类
            html = self._postprocess_html(html)
            
            return html
        except Exception as e:
            print(f"Markdown转换错误: {e}")
            # 如果转换失败，返回原始文本的HTML转义版本
            return f'<div class="markdown-error">{self._escape_html(text)}</div>'
    
    def _preprocess_code_blocks(self, text):
        """预处理码块，确保格式正确"""
        # 处理```代码块
        lines = text.split('\n')
        in_code_block = False
        code_language = ''
        processed_lines = []
        
        for line in lines:
            if line.strip().startswith('```'):
                if not in_code_block:
                    # 开始代码块
                    in_code_block = True
                    # 提取语言
                    match = re.match(r'^```(\w+)?', line.strip())
                    if match:
                        code_language = match.group(1) or ''
                    processed_lines.append(line)
                else:
                    # 结束代码块
                    in_code_block = False
                    code_language = ''
                    processed_lines.append(line)
            elif in_code_block:
                # 在代码块内，保持原样
                processed_lines.append(line)
            else:
                # 不在代码块内，处理行内代码
                line = re.sub(r'`([^`]+)`', r'<code>\1</code>', line)
                processed_lines.append(line)
        
        return '\n'.join(processed_lines)
    
    def _postprocess_html(self, html):
        """后处理HTML，添加样式类和优化"""
        # 为表格添加样式类
        html = re.sub(r'<table>', '<table class="markdown-table">', html)
        html = re.sub(r'<thead>', '<thead class="markdown-thead">', html)
        html = re.sub(r'<tbody>', '<tbody class="markdown-tbody">', html)
        
        # 为引用块添加样式类
        html = re.sub(r'<blockquote>', '<blockquote class="markdown-blockquote">', html)
        
        # 为列表添加样式类
        html = re.sub(r'<ul>', '<ul class="markdown-list">', html)
        html = re.sub(r'<ol>', '<ol class="markdown-list">', html)
        
        # 为标题添加样式类
        for i in range(1, 7):
            html = re.sub(
                rf'<h{i}>', 
                f'<h{i} class="markdown-h{i}">', 
                html
            )
        
        return html
    
    def _escape_html(self, text):
        """HTML转义"""
        import html
        return html.escape(text)
    
    def extract_text_only(self, text, max_length=200):
        """提取纯文本（用于预览）"""
        if not text:
            return ''
        
        # 移除代码块
        text = re.sub(r'```[\s\S]*?```', '', text)
        # 移除行内代码
        text = re.sub(r'`[^`]*`', '', text)
        # 移除图片标记
        text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)
        # 移除链接标记
        text = re.sub(r'\[[^\]]*\]\([^)]*\)', '', text)
        # 移除Markdown标记
        text = re.sub(r'[#*_~`>]', '', text)
        # 移除多余的空格和换行
        text = ' '.join(text.split())
        
        if len(text) > max_length:
            text = text[:max_length] + '...'
        
        return text

# 创建全局实例
markdown_processor = MarkdownProcessor()
