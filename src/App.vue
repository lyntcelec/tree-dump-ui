<template>
  <div style="padding: 20px; position: relative;">
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

    <ElTree v-if="treeData.length > 0" :data="treeData" show-checkbox node-key="id"
      :default-checked-keys="defaultCheckedKeys" :props="defaultProps" ref="treeRef"
      @check-change="updateFileContents" />

    <div style="position: relative; margin-top: 20px;">
      <ElInput v-model="fileContents" type="textarea" :rows="10" readonly />
      <Icon icon="fxemoji:clipboard" :size="40" class="icon-copy"
        @click="copyToClipboard" />
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { ElTree, ElInput, ElButton, ElMessage, ElLoading } from "element-plus";
import { Icon } from '@/components/Icon';

const path = ref("");
const treeData = ref([]);
const defaultProps = {
  children: "children",
  label: "label",
};
const treeRef = ref();
const defaultCheckedKeys = ref([]);
const fileContents = ref("");
let isLoading: any;

const startLoading = () => {
  isLoading = ElLoading.service({ text: 'Loading...', fullscreen: true })
};

const stopLoading = () => {
  isLoading.close();
};

const getRelativePath = (absolutePath: string) => {
  if (absolutePath.startsWith(path.value)) {
    return "." + absolutePath.slice(path.value.length);
  } else {
    return absolutePath;
  }
};

const generateCheckedTreeText = (nodes: any[], prefix = ""): string => {
  let treeText = "";
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = prefix + (isLast ? "└── " : "├── ");

    const treeNode = treeRef.value.getNode(node.id);
    const isChecked = treeNode.checked;
    const isIndeterminate = treeNode.indeterminate;

    if (isChecked || isIndeterminate) {
      treeText += connector + node.label + "\n";
      if (node.children && node.children.length > 0) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        treeText += generateCheckedTreeText(node.children, newPrefix);
      }
    }
  });
  return treeText;
};

const loadTreeData = async () => {
  if (path.value && path.value.trim() !== "") {
    startLoading();
    try {
      const result = await window.api.scanDirectory(path.value);
      treeData.value = result.treeData;
      defaultCheckedKeys.value = result.selectedIds; // Set defaultCheckedKeys directly
      await nextTick(); // Wait for the tree to render
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
  }));

  try {
    await window.api.saveTreedump(path.value, serializableNodes);
    ElMessage.success("Selected directories saved to .treedump");
  } catch (error) {
    ElMessage.error("Failed to save .treedump");
  }
};

const updateFileContents = async () => {
  const checkedNodes = treeRef.value.getCheckedNodes(true, false);

  const fileNodes = checkedNodes.filter((node: any) => !node.children);

  const filePaths = fileNodes.map((node: any) => getRelativePath(node.id));

  const treeText = "Tree:\n" + generateCheckedTreeText(treeData.value);

  if (filePaths.length > 0) {
    const fullPath = path.value;
    const contents = await window.api.readFiles(fullPath, filePaths);

    let output = treeText + "\nFiles:\n";

    for (const filePath of filePaths) {
      const relativePath = getRelativePath(filePath);
      output += `\`\`\`${relativePath}\n${contents[filePath]}\n\`\`\`\n`;
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
      ElMessage.success("Text copied to clipboard");
    })
    .catch((err) => {
      console.error('Failed to copy text: ', err);
      ElMessage.error("Failed to copy text");
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
</style>
