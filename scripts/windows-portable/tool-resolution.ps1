# Shared Windows portable tool resolution helpers.

function Resolve-AncloraPathCandidate {
    param(
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    if (Test-Path $Path) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return $null
}

function Resolve-AncloraCommandPath {
    param(
        [string[]]$Names
    )

    foreach ($name in $Names) {
        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }

        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -ne $null -and -not [string]::IsNullOrWhiteSpace($cmd.Source)) {
            if (Test-Path $cmd.Source) {
                return [System.IO.Path]::GetFullPath($cmd.Source)
            }
        }
    }

    return $null
}

function Resolve-AncloraTool {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [string[]]$PortablePaths = @(),

        [string]$EnvVar,

        [string[]]$StandardPaths = @(),

        [string[]]$CommandNames = @()
    )

    foreach ($path in $PortablePaths) {
        $resolved = Resolve-AncloraPathCandidate $path
        if ($resolved) {
            return @{
                Name = $Name
                Path = $resolved
                Source = 'portable'
                EnvVar = $EnvVar
                Resolved = $true
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($EnvVar)) {
        $envValue = [Environment]::GetEnvironmentVariable($EnvVar)
        $resolved = Resolve-AncloraPathCandidate $envValue
        if ($resolved) {
            return @{
                Name = $Name
                Path = $resolved
                Source = 'env'
                EnvVar = $EnvVar
                Resolved = $true
            }
        }
    }

    foreach ($path in $StandardPaths) {
        $resolved = Resolve-AncloraPathCandidate $path
        if ($resolved) {
            return @{
                Name = $Name
                Path = $resolved
                Source = 'standard'
                EnvVar = $EnvVar
                Resolved = $true
            }
        }
    }

    $commandPath = Resolve-AncloraCommandPath $CommandNames
    if ($commandPath) {
        return @{
            Name = $Name
            Path = $commandPath
            Source = 'path'
            EnvVar = $EnvVar
            Resolved = $true
        }
    }

    $fallback = $null
    if ($PortablePaths.Count -gt 0) {
        $fallback = $PortablePaths[0]
    } elseif ($StandardPaths.Count -gt 0) {
        $fallback = $StandardPaths[0]
    }

    return @{
        Name = $Name
        Path = $fallback
        Source = 'missing'
        EnvVar = $EnvVar
        Resolved = $false
    }
}

function Resolve-AncloraWindowsTools {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDir
    )

    $ffmpegPortable = @(
        (Join-Path $BaseDir 'tools\ffmpeg\ffmpeg.exe'),
        (Join-Path $BaseDir 'tools\ffmpeg\bin\ffmpeg.exe')
    )
    $ffprobePortable = @(
        (Join-Path $BaseDir 'tools\ffmpeg\ffprobe.exe'),
        (Join-Path $BaseDir 'tools\ffmpeg\bin\ffprobe.exe')
    )
    $qpdfPortable = @(
        (Join-Path $BaseDir 'tools\qpdf\qpdf.exe'),
        (Join-Path $BaseDir 'tools\qpdf\bin\qpdf.exe')
    )
    $sevenZipPortable = @(
        (Join-Path $BaseDir 'tools\sevenzip\7z.exe'),
        (Join-Path $BaseDir 'tools\sevenzip\7za.exe'),
        (Join-Path $BaseDir 'tools\sevenzip\7zr.exe')
    )

    return @{
        Ytdlp = Resolve-AncloraTool `
            -Name 'yt-dlp' `
            -PortablePaths @((Join-Path $BaseDir 'tools\yt-dlp\yt-dlp.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_YTDLP_PATH' `
            -CommandNames @('yt-dlp.exe', 'yt-dlp')

        Ffmpeg = Resolve-AncloraTool `
            -Name 'FFmpeg' `
            -PortablePaths $ffmpegPortable `
            -EnvVar 'ANCLORA_FILESTUDIO_FFMPEG_PATH' `
            -CommandNames @('ffmpeg.exe', 'ffmpeg')

        Ffprobe = Resolve-AncloraTool `
            -Name 'FFprobe' `
            -PortablePaths $ffprobePortable `
            -EnvVar 'ANCLORA_FILESTUDIO_FFPROBE_PATH' `
            -CommandNames @('ffprobe.exe', 'ffprobe')

        Qpdf = Resolve-AncloraTool `
            -Name 'QPDF' `
            -PortablePaths $qpdfPortable `
            -EnvVar 'ANCLORA_FILESTUDIO_QPDF_PATH' `
            -CommandNames @('qpdf.exe', 'qpdf')

        SevenZip = Resolve-AncloraTool `
            -Name '7-Zip' `
            -PortablePaths $sevenZipPortable `
            -EnvVar 'ANCLORA_FILESTUDIO_7ZIP_PATH' `
            -CommandNames @('7z.exe', '7z', '7za.exe', '7za', '7zr.exe', '7zr')

        Pandoc = Resolve-AncloraTool `
            -Name 'Pandoc' `
            -PortablePaths @((Join-Path $BaseDir 'tools\pandoc\pandoc.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_PANDOC_PATH' `
            -CommandNames @('pandoc.exe', 'pandoc')

        LibreOffice = Resolve-AncloraTool `
            -Name 'LibreOffice' `
            -PortablePaths @((Join-Path $BaseDir 'tools\libreoffice\program\soffice.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_LIBREOFFICE_PATH' `
            -StandardPaths @('C:\Program Files\LibreOffice\program\soffice.exe') `
            -CommandNames @('soffice.exe', 'soffice')

        Calibre = Resolve-AncloraTool `
            -Name 'Calibre' `
            -PortablePaths @((Join-Path $BaseDir 'tools\calibre\ebook-convert.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_CALIBRE_PATH' `
            -StandardPaths @('C:\Program Files\Calibre2\ebook-convert.exe') `
            -CommandNames @('ebook-convert.exe', 'ebook-convert')

        Tesseract = Resolve-AncloraTool `
            -Name 'Tesseract' `
            -PortablePaths @((Join-Path $BaseDir 'tools\tesseract\tesseract.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_TESSERACT_PATH' `
            -StandardPaths @('C:\Program Files\Tesseract-OCR\tesseract.exe') `
            -CommandNames @('tesseract.exe', 'tesseract')

        Tessdata = Resolve-AncloraTool `
            -Name 'Tesseract tessdata' `
            -PortablePaths @((Join-Path $BaseDir 'tools\tessdata')) `
            -EnvVar 'ANCLORA_FILESTUDIO_TESSDATA_PREFIX' `
            -StandardPaths @('C:\Program Files\Tesseract-OCR\tessdata')

        Poppler = Resolve-AncloraTool `
            -Name 'Poppler' `
            -PortablePaths @((Join-Path $BaseDir 'tools\poppler\pdftoppm.exe')) `
            -EnvVar 'ANCLORA_FILESTUDIO_POPPLER_PATH' `
            -CommandNames @('pdftoppm.exe', 'pdftoppm')
    }
}
