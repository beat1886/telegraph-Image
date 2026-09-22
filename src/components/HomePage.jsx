"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { faImages, faTrashAlt, faUpload, faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import LoadingOverlay from "@/components/LoadingOverlay";
import Footer from "@/components/Footer";
import AuthButton from "@/components/AuthButton";

export default function HomePage({ initialRole }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedFilesNum, setUploadedFilesNum] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [uploading, setUploading] = useState(false);
  const [IP, setIP] = useState('');
  const [Total, setTotal] = useState('?');
  const [selectedOption, setSelectedOption] = useState('tg');
  // 初始登录态由服务端组件通过 initialRole 注入，首屏即正确，不闪不等
  const [isAuthapi, setisAuthapi] = useState(!!initialRole);
  const [Loginuser, setLoginuser] = useState(initialRole || '');
  const [boxType, setBoxtype] = useState("img");

  const parentRef = useRef(null);

  let headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0, Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  };

  useEffect(() => {
    ip();
    getTotal();
    isAuth();
  }, []);

  const ip = async () => {
    try {
      const res = await fetch(`/api/ip`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setIP(data.ip);
    } catch (error) {
      console.error('请求出错:', error);
    }
  };

  const isAuth = async () => {
    try {
      const res = await fetch(`/api/enableauthapi/isauth`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        setisAuthapi(true);
        setLoginuser(data.role);
        // 非 admin 用户：如果之前选择了 r2，则回退到 tg
        if (data.role !== 'admin') {
          setSelectedOption((prev) => (prev === "r2" ? "tg" : prev));
        }
      } else {
        setisAuthapi(false);
        // 未登录：保留用户可能选择的 tgchannel，仅将 r2 回退为 tg
        setSelectedOption((prev) => (prev === "r2" ? "tg" : prev));
      }
    } catch (error) {
      console.error('请求出错:', error);
    }
    // 初始状态已由服务端注入，这里仅做客户端刷新校正
  };

  const getTotal = async () => {
    try {
      const res = await fetch(`/api/total`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setTotal(data.total);
    } catch (error) {
      console.error('请求出错:', error);
    }
  };

  const handleFileChange = (event) => {
    const newFiles = event.target.files;
    const filteredFiles = Array.from(newFiles).filter(file =>
      !selectedFiles.find(selFile => selFile.name === file.name));
    const uniqueFiles = filteredFiles.filter(file =>
      !uploadedImages.find(upImg => upImg.name === file.name)
    );
    setSelectedFiles([...selectedFiles, ...uniqueFiles]);
  };

  const handleClear = () => {
    setSelectedFiles([]);
  };

  const getTotalSizeInMB = (files) => {
    const totalSizeInBytes = Array.from(files).reduce((acc, file) => acc + file.size, 0);
    return (totalSizeInBytes / (1024 * 1024)).toFixed(2);
  };

  const handleUpload = async (file = null) => {
    setUploading(true);
    const filesToUpload = file ? [file] : selectedFiles;

    if (filesToUpload.length === 0) {
      toast.error('请选择要上传的文件');
      setUploading(false);
      return;
    }

    const formFieldName = selectedOption === "tencent" ? "media" : "file";
    let successCount = 0;

    try {
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append(formFieldName, file);

        // 关键修改：只有 r2 走认证接口，tgchannel 走公开接口
        const targetUrl = selectedOption === "r2"
          ? `/api/enableauthapi/r2`
          : `/api/${selectedOption}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        let response;
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
            headers: headers,
            signal: controller.signal
          });
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            toast.error(`上传 ${file.name} 超时（60秒无响应），请检查网络或稍后重试`);
          } else {
            toast.error(`上传 ${file.name} 网络错误: ${fetchErr.message}`);
          }
          continue;
        }
        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          file.url = result.url;
          setUploadedImages((prevImages) => [...prevImages, file]);
          setSelectedFiles((prevFiles) => prevFiles.filter(f => f !== file));
          successCount++;
        } else {
          let errorMsg = "上传失败";
          try {
            const errorData = await response.json();
            errorMsg = errorData.message || `上传 ${file.name} 图片时出错`;
          } catch {}
          toast.error(`上传 ${file.name} 图片时出错: ${errorMsg}`);
        }
      }
      toast.success(`已成功上传 ${successCount} 张图片`);
    } catch (error) {
      toast.error('上传错误');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (event) => {
    const clipboardItems = event.clipboardData.items;
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.kind === 'file' && item.type.includes('image')) {
        const file = item.getAsFile();
        setSelectedFiles([...selectedFiles, file]);
        break;
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const filteredFiles = Array.from(files).filter(file => !selectedFiles.find(selFile => selFile.name === file.name));
      setSelectedFiles([...selectedFiles, ...filteredFiles]);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const calculateMinHeight = () => {
    const perRow = typeof window !== 'undefined' && window.innerWidth >= 640 ? 4 : 2;
    const rows = Math.ceil(selectedFiles.length / perRow);
    return `${rows * 210 + 24}px`;
  };

  const handleImageClick = (index) => {
    if (selectedFiles[index].type.startsWith('image/')) {
      setBoxtype("img");
    } else {
      setBoxtype("other");
    }
    setSelectedImage(URL.createObjectURL(selectedFiles[index]));
  };

  const handleCloseImage = () => {
    setSelectedImage(null);
  };

  const handleRemoveImage = (index) => {
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== index);
    setSelectedFiles(updatedFiles);
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`链接复制成功`);
    } catch (err) {
      toast.error("链接复制失败");
    }
  };

  const handleCopyCode = async () => {
    const codeElements = parentRef.current.querySelectorAll('code');
    const values = Array.from(codeElements).map(code => code.textContent);
    try {
      await navigator.clipboard.writeText(values.join("\n"));
      toast.success(`链接复制成功`);
    } catch (error) {
      toast.error(`链接复制失败`);
    }
  };

  const handlerenderImageClick = (imageUrl, type) => {
    setBoxtype(type);
    setSelectedImage(imageUrl);
  };

  const renderFile = (data, index) => {
    const fileUrl = data.url;
    if (data.type.startsWith('image/')) {
      return (
        <img
          key={`image-${index}`}
          src={data.url}
          alt={`Uploaded ${index}`}
          className="object-cover w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg cursor-pointer"
          onClick={() => handlerenderImageClick(fileUrl, "img")}
        />
      );
    } else {
      return (
        <img
          key={`image-${index}`}
          src={data.url}
          alt={`Uploaded ${index}`}
          className="object-cover w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg cursor-pointer"
          onClick={() => handlerenderImageClick(fileUrl, "other")}
        />
      );
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'preview':
        return (
          <div className="flex flex-col">
            {uploadedImages.map((data, index) => (
              <div key={index} className="m-1 sm:m-2 rounded-2xl ring-offset-2 ring-2 ring-slate-100 flex flex-col sm:flex-row">
                {renderFile(data, index)}
                <div className="flex flex-col justify-center w-full sm:w-4/5 p-2 sm:p-0">
                  {[
                    { text: data.url, onClick: () => handleCopy(data.url) },
                    { text: `![${data.name}](${data.url})`, onClick: () => handleCopy(`![${data.name}](${data.url})`) },
                    { text: `<a href="${data.url}" target="_blank"><img src="${data.url}"></a>`, onClick: () => handleCopy(`<a href="${data.url}" target="_blank"><img src="${data.url}"></a>`) },
                    { text: `[img]${data.url}[/img]`, onClick: () => handleCopy(`[img]${data.url}[/img]`) },
                  ].map((item, i) => (
                    <input
                      key={`input-${i}`}
                      readOnly
                      value={item.text}
                      onClick={item.onClick}
                      className="px-2 sm:px-3 my-1 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm text-gray-800 focus:outline-none w-full"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      case 'htmlLinks':
        return (
          <div ref={parentRef} className="p-4 bg-slate-100" onClick={handleCopyCode}>
            {uploadedImages.map((data, index) => (
              <div key={index} className="mb-2">
                <code className="break-all">{`<img src="${data.url}" alt="${data.name}" />`}</code>
              </div>
            ))}
          </div>
        );
      case 'markdownLinks':
        return (
          <div ref={parentRef} className="p-4 bg-slate-100" onClick={handleCopyCode}>
            {uploadedImages.map((data, index) => (
              <div key={index} className="mb-2">
                <code className="break-all">{`![${data.name}](${data.url})`}</code>
              </div>
            ))}
          </div>
        );
      case 'bbcodeLinks':
        return (
          <div ref={parentRef} className="p-4 bg-slate-100" onClick={handleCopyCode}>
            {uploadedImages.map((data, index) => (
              <div key={index} className="mb-2">
                <code className="break-all">{`[img]${data.url}[/img]`}</code>
              </div>
            ))}
          </div>
        );
      case 'viewLinks':
        return (
          <div ref={parentRef} className="p-4 bg-slate-100" onClick={handleCopyCode}>
            {uploadedImages.map((data, index) => (
              <div key={index} className="mb-2">
                <code className="break-all">{`${data.url}`}</code>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const handleSelectChange = (e) => {
    setSelectedOption(e.target.value);
  };

  return (
    <main className="overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
      <header className="fixed top-0 h-[50px] left-0 w-full border-b bg-white flex z-50 justify-center items-center">
        <div className="flex justify-between items-center w-full max-w-4xl px-3 sm:px-4">
          <nav className="text-base sm:text-lg font-medium">图床</nav>
          <AuthButton />
        </div>
      </header>
      <div className="mt-[60px] w-[92%] sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-2/3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-0">
          <div className="flex flex-col">
            <div className="text-gray-800 text-lg">图片上传</div>
            <div className="mb-1 sm:mb-4 text-xs sm:text-sm text-gray-500">
              上传文件最大 5 MB，本站已托管 <span className="text-cyan-600">{Total}</span> 张图片
            </div>
          </div>
          <div className="flex flex-row items-center gap-2">
            <span className="text-sm sm:text-base md:text-sm lg:text-xl xl:text-xl 2xl:text-xl whitespace-nowrap">上传接口：</span>
            <select
              value={selectedOption}
              onChange={handleSelectChange}
              className="text-xs sm:text-base md:text-sm lg:text-xl p-2 border rounded flex-1 min-w-0 sm:flex-none sm:w-72 lg:w-80 text-left pl-3"
            >
              <option value="tg">TG(临时，会失效)</option>
              <option value="tgchannel">TG_Channel(较长期)</option>
              {isAuthapi && Loginuser === "admin" && <option value="r2">cloudflare的R2 对象存储（长期，可能会付费）</option>}
            </select>
          </div>
        </div>

        <div
          className="border-2 border-dashed border-slate-400 rounded-md relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onPaste={handlePaste}
          style={{ minHeight: calculateMinHeight() }}
        >
          <div className="flex flex-wrap gap-3 min-h-[240px] justify-center sm:justify-start p-2">
            <LoadingOverlay loading={uploading} />
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative rounded-2xl w-36 h-44 sm:w-44 sm:h-48 ring-offset-2 ring-2 flex flex-col items-center">
                <div className="relative w-28 h-28 sm:w-36 sm:h-36" onClick={() => handleImageClick(index)}>
                  {file.type.startsWith('image/') && (
                    <Image
                      src={URL.createObjectURL(file)}
                      alt={`Preview ${file.name}`}
                      fill
                      style={{ objectFit: "cover" }}
                    />
                  )}
                  {!file.type.startsWith('image/') && (
                    <div className="flex items-center justify-center w-full h-full bg-gray-200 text-gray-700 p-1">
                      <p className="text-xs text-center break-all line-clamp-3">{file.name}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-row items-center justify-center w-full mt-2 sm:mt-3 gap-2 sm:gap-0">
                  <button
                    className="bg-blue-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleImageClick(index)}
                    aria-label="预览"
                  >
                    <FontAwesomeIcon icon={faSearchPlus} className="text-xs sm:text-[13px]" />
                  </button>
                  <button
                    className="bg-red-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleRemoveImage(index)}
                    aria-label="删除"
                  >
                    <FontAwesomeIcon icon={faTrashAlt} className="text-xs sm:text-[13px]" />
                  </button>
                  <button
                    className="bg-green-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleUpload(file)}
                    aria-label="上传"
                  >
                    <FontAwesomeIcon icon={faUpload} className="text-xs sm:text-[13px]" />
                  </button>
                </div>
              </div>
            ))}
            {selectedFiles.length === 0 && (
              <div className="absolute -z-10 left-0 top-0 w-full h-full flex items-center justify-center">
                <div className="text-gray-500">
                  拖拽文件到这里或将屏幕截图复制并粘贴到此处上传
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full rounded-md shadow-sm overflow-hidden mt-4 grid grid-cols-8 text-sm select-none">
          <div className="md:col-span-1 col-span-3">
            <label
              htmlFor="file-upload"
              className="w-full h-10 bg-blue-500 cursor-pointer flex items-center justify-center text-white text-xs sm:text-sm"
            >
              <FontAwesomeIcon icon={faImages} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              选择图片
            </label>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              multiple
            />
          </div>
          <div className="md:col-span-5 col-span-5">
            <div className="w-full h-10 bg-slate-200 flex items-center px-2 sm:px-4 text-xs sm:text-sm justify-center md:justify-start truncate">
              已选择 {selectedFiles.length} 张，共 {getTotalSizeInMB(selectedFiles)} M
            </div>
          </div>
          <div className="md:col-span-1 col-span-3">
            <div
              className="w-full bg-red-500 cursor-pointer h-10 flex items-center justify-center text-white text-xs sm:text-sm"
              onClick={handleClear}
            >
              <FontAwesomeIcon icon={faTrashAlt} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              清除
            </div>
          </div>
          <div className="md:col-span-1 col-span-5">
            <div
              className={`w-full bg-green-500 cursor-pointer h-10 flex items-center justify-center text-white text-xs sm:text-sm ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => handleUpload()}
            >
              <FontAwesomeIcon icon={faUpload} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              上传
            </div>
          </div>
        </div>

        <ToastContainer position="top-center" />
        {uploadedImages.length > 0 && (
          <div className="w-full mt-4 min-h-[200px] mb-[60px]">
            <div className="flex flex-nowrap sm:flex-wrap gap-2 mb-4 border-b border-gray-300 overflow-x-auto sm:overflow-visible pb-1">
              <button onClick={() => setActiveTab('preview')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'preview' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Preview</button>
              <button onClick={() => setActiveTab('htmlLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'htmlLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>HTML</button>
              <button onClick={() => setActiveTab('markdownLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'markdownLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Markdown</button>
              <button onClick={() => setActiveTab('bbcodeLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'bbcodeLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>BBCode</button>
              <button onClick={() => setActiveTab('viewLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'viewLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Links</button>
            </div>
            {renderTabContent()}
          </div>
        )}
      </div>
      
      <Footer />

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleCloseImage}>
          <div className="relative flex flex-col items-center justify-between max-w-full">
            <button
              className="absolute -top-2 -right-2 sm:top-2 sm:right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
              onClick={handleCloseImage}
            >
              &times;
            </button>
            {boxType === "img" ? (
              <img
                src={selectedImage}
                alt="Selected"
                className="object-contain w-[92%] sm:w-9/10 max-h-[85vh] h-auto rounded-lg"
              />
            ) : (
              <div className="p-4 bg-white text-black rounded">
                <p>不支持的文件类型</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
