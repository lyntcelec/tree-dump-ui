<template>
  <div style="padding: 20px; position: relative;">
    <ElAffix :offset="10">
      <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <ElInput v-model="path" placeholder="Current Path" @change="onPathChange" clearable style="flex: 1;" />
        <ElButton type="primary" @click="browseDirectory" style="margin-left: 10px;">
          Browse
        </ElButton>
        <ElButton type="primary" @click="saveSelected" style="margin-left: 10px;">
          Save
        </ElButton>
        <ElButton type="primary" @click="handleReload" style="margin-left: 10px;">
          Reload
        </ElButton>
      </div>
    </ElAffix>

    <ElTree v-if="treeData.length > 0" :data="treeData" show-checkbox node-key="id"
      :default-checked-keys="defaultCheckedKeys" :props="defaultProps" ref="treeRef" @check-change="updateFileContents"
      @node-click="handleNodeClick" />

    <div style="position: relative; margin-top: 20px;">
      <ElInput v-model="fileContents" type="textarea" :rows="10" readonly />
      <Icon icon="fxemoji:clipboard" :size="40" class="icon-copy" @click="copyToClipboard" />
    </div>

    <ElDialog v-model="dialogVisible" title="Select Lines" width="80%" :before-close="handleDialogClose">
      <div>
        <!-- Line selection inputs -->
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
          <ElInputNumber v-model="lineFrom" :min="1" :max="totalLines" label="Line From" style="flex: 1;" />
          <ElInputNumber v-model="lineTo" :min="lineFrom" :max="totalLines" label="Line To" style="flex: 1;" />
        </div>

        <!-- File content display -->
        <div class="file-content marked-custom" tabindex="0" ref="contentDivRef" @mouseup="onTextSelect"
          @keydown="onKeyDown" v-html="marked.parse(`\`\`\`\n${formattedFileContent}\n\`\`\``)"></div>
      </div>
      <template #footer>
        <ElButton @click="dialogVisible = false">Cancel</ElButton>
        <ElButton type="primary" @click="handleDialogOk">OK</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import {
  ElTree,
  ElInput,
  ElButton,
  ElMessage,
  ElLoading,
  ElDialog,
  ElInputNumber,
  ElAffix,
} from 'element-plus';
import { Icon } from '@/components/Icon';

interface TreeNode {
  id: string;
  label: string;
  lineFrom?: number;
  lineTo?: number;
  children?: TreeNode[];
}

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code) {
      return hljs.highlightAuto(code).value;
    },
  })
);
marked.use({ silent: true, breaks: true });

const path = ref('');
const treeData = ref([]);
const defaultProps = {
  children: 'children',
  label: 'label',
};
const treeRef = ref();
const defaultCheckedKeys = ref([]);
const fileContents = ref('');
let isLoading: any;

const dialogVisible = ref(false);
const lineFrom = ref(1);
const lineTo = ref(1);
const totalLines = ref(1);
const fileContent = ref('');
const formattedFileContent = ref(''); // No line numbers in display

const currentNode = ref<TreeNode | null>(null);

const contentDivRef = ref(null);

const startLoading = () => {
  isLoading = ElLoading.service({ text: 'Loading...', fullscreen: true });
};

const stopLoading = () => {
  isLoading.close();
};

const getRelativePath = (absolutePath: string) => {
  if (absolutePath.startsWith(path.value)) {
    return '.' + absolutePath.slice(path.value.length);
  } else {
    return absolutePath;
  }
};

const generateCheckedTreeText = (nodes: any[], prefix = ''): string => {
  let treeText = '';
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = prefix + (isLast ? '└── ' : '├── ');

    const treeNode = treeRef.value.getNode(node.id);
    const isChecked = treeNode.checked;
    const isIndeterminate = treeNode.indeterminate;

    if (isChecked || isIndeterminate) {
      treeText += connector + node.label + '\n';
      if (node.children && node.children.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        treeText += generateCheckedTreeText(node.children, newPrefix);
      }
    }
  });
  return treeText;
};

const loadTreeData = async () => {
  if (path.value && path.value.trim() !== '') {
    startLoading();
    try {
      const result = await window.api.scanDirectory(path.value);
      treeData.value = result.treeData;
      defaultCheckedKeys.value = result.selectedIds;
      await nextTick();
      await updateFileContents();
    } finally {
      stopLoading();
    }
  }
};

const onPathChange = async () => {
  await loadTreeData();
  await window.api.saveConfig(path.value);
};

const browseDirectory = async () => {
  startLoading();
  try {
    const selectedPath = await window.api.openDirectory();
    if (selectedPath) {
      path.value = selectedPath;
      await loadTreeData();
      await window.api.saveConfig(path.value);
    }
  } finally {
    stopLoading();
  }
};

const saveSelected = async () => {
  const checkedNodes = treeRef.value.getCheckedNodes(true, false);

  const serializableNodes = checkedNodes.map((node: any) => ({
    id: getRelativePath(node.id),
    label: node.label,
    lineFrom: node.lineFrom,
    lineTo: node.lineTo,
  }));

  try {
    await window.api.saveTreedump(path.value, serializableNodes);
    ElMessage.success('Selected directories and files saved to .treedump');
  } catch (error) {
    ElMessage.error('Failed to save .treedump');
  }
};

const updateFileContents = async () => {
  const checkedNodes = treeRef.value.getCheckedNodes(true, false);

  const fileNodes = checkedNodes.filter((node: any) => !node.children);

  const filePaths = fileNodes.map((node: any) => getRelativePath(node.id));

  const treeText = 'Tree:\n' + generateCheckedTreeText(treeData.value);

  if (filePaths.length > 0) {
    const fullPath = path.value;
    const contents = await window.api.readFiles(fullPath, filePaths);

    let output = treeText + '\nFiles:\n';

    for (const node of fileNodes) {
      const filePath = getRelativePath(node.id);
      let fileContent = contents[filePath];
      if (node.lineFrom !== undefined && node.lineTo !== undefined) {
        const lines = fileContent
          .split('\n')
          .slice(node.lineFrom - 1, node.lineTo);
        fileContent = lines.join('\n');
      }
      output += `\`\`\`${filePath}\n${fileContent}\n\`\`\`\n`;
    }

    fileContents.value = output;
  } else {
    fileContents.value = treeText;
  }
};

const copyToClipboard = () => {
  navigator.clipboard
    .writeText(fileContents.value)
    .then(() => {
      ElMessage.success('Text copied to clipboard');
    })
    .catch((err) => {
      console.error('Failed to copy text: ', err);
      ElMessage.error('Failed to copy text');
    });
};

const handleReload = async () => {
  await loadTreeData();
};

onMounted(async () => {
  const savedPath = await window.api.loadConfig();
  if (savedPath) {
    path.value = savedPath;
    await loadTreeData();
  }
});

const handleNodeClick = async (node: any) => {
  if (!node.children) {
    // It's a file
    currentNode.value = node;
    const fullPath = path.value;
    const contents = await window.api.readFiles(fullPath, [
      getRelativePath(node.id),
    ]);
    fileContent.value = contents[getRelativePath(node.id)];

    const lines = fileContent.value.split('\n');
    totalLines.value = lines.length;

    // Initialize lineFrom and lineTo
    lineFrom.value = node.lineFrom !== undefined ? node.lineFrom : 1;
    lineTo.value = node.lineTo !== undefined ? node.lineTo : totalLines.value;

    formattedFileContent.value = lines.join('\n'); // No line numbers

    dialogVisible.value = true;
    await nextTick();
  }
};

const handleDialogOk = () => {
  if (currentNode.value) {
    currentNode.value.lineFrom = lineFrom.value;
    currentNode.value.lineTo = lineTo.value;
    dialogVisible.value = false;
    updateFileContents();
  }
};

const handleDialogClose = () => {
  dialogVisible.value = false;
};

const onTextSelect = () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString() : '';

  if (selectedText && fileContent.value) {
    const lines = fileContent.value.split('\n');
    const selectedStart = fileContent.value.indexOf(selectedText);
    const selectedEnd = selectedStart + selectedText.length;

    let startLine = 1;
    let endLine = 1;
    let currentCharCount = 0;

    lines.forEach((line, index) => {
      const lineLength = line.length + 1; // +1 for the newline character

      if (
        currentCharCount <= selectedStart &&
        selectedStart < currentCharCount + lineLength
      ) {
        startLine = index + 1;
      }
      if (
        currentCharCount <= selectedEnd &&
        selectedEnd <= currentCharCount + lineLength
      ) {
        endLine = index + 1;
      }

      currentCharCount += lineLength;
    });

    lineFrom.value = startLine;
    lineTo.value = endLine;
  }
};

const onKeyDown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
    event.preventDefault();

    selectAllTextInContentBox();

    lineFrom.value = 1;
    lineTo.value = totalLines.value;
  }
};

const selectAllTextInContentBox = () => {
  const contentDiv = contentDivRef.value;
  if (contentDiv) {
    const range = document.createRange();
    range.selectNodeContents(contentDiv);
    const selection = window.getSelection();
    selection!.removeAllRanges();
    selection!.addRange(range);
  }
};
</script>

<style scoped>
.ElInput {
  margin-bottom: 20px;
}

.icon-copy {
  position: absolute;
  top: 10px;
  right: 10px;
}

.icon-copy:hover {
  transform: scale(1.2);
  transition: transform 0.3s ease-in-out;
}

.icon-copy:hover path {
  fill: #42b983;
}

.file-content {
  padding: 10px;
  max-height: 400px;
  overflow-y: auto;
  cursor: text;
  user-select: text;
  border: 1px solid #dcdfe6;
}

.file-content:focus {
  outline: 2px solid #409EFF;
}

.dialog-footer {
  text-align: right;
}

.el-input-number {
  width: 100%;
}

.marked-custom {
  white-space: pre-wrap;
  word-wrap: break-word;
}

:deep(.marked-custom code) {
  white-space: pre-wrap;
  word-wrap: break-word;
}

:deep(.marked-custom p) {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
