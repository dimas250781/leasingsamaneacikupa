
"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddEditDialog } from '@/components/leasing/add-edit-dialog';
import { initialData } from '@/lib/data';
import type { LeasingEntry } from '@/lib/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Filter, Save, Upload, Download, FileSpreadsheet, Languages, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { translateContent } from '@/ai/flows/translate-content-flow';
import { defaultUiText, languages, UiText } from '@/lib/translate';
import { translateCell } from '@/ai/flows/translate-cell-flow';
import { LeasingDataTable } from '@/components/leasing/data-table';


type LeasingFilter = Partial<{
  week: string;
  date: string;
  tenantName: string;
  businessName: string;
  businessType: string;
  contact: string;
  notes: string;
  status: string;
}>;

type SortConfig = {
  key: keyof LeasingEntry;
  direction: 'ascending' | 'descending';
} | null;


export default function Home() {
  const [data, setData] = useState<LeasingEntry[]>([]);
  const [filteredData, setFilteredData] = useState<LeasingEntry[]>([]);
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(2025, 5, 1),
    to: new Date(2025, 5, 30),
  });
  const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
  const [entryToEdit, setEntryToEdit] = useState<LeasingEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<LeasingEntry | null>(null);

  const [filters, setFilters] = useState<LeasingFilter>({});
  const [tempFilters, setTempFilters] = useState<LeasingFilter>({});
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staffName, setStaffName] = useState('');
  
  const [uiText, setUiText] = useState<UiText>(defaultUiText);
  const [isTranslating, setIsTranslating] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  useEffect(() => {
    try {
        const item = window.localStorage.getItem('leasingData');
        if (item) {
            setData(JSON.parse(item));
        } else {
            setData(initialData);
        }
    } catch (error) {
        console.error("Failed to load data from localStorage", error);
        setData(initialData);
    }
  }, []);

  useEffect(() => {
    const filteredByDate = data.filter(entry => {
      if (!date?.from) {
        return true; // Don't filter if no start date is selected
      }

      const entryDate = new Date(entry.date);
      // The picker returns a date in the local timezone. We need to compare just the date part, so we convert it to a UTC date.
      const from = date.from;
      const fromInUTC = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));

      // If 'to' is not selected, the range is just the 'from' date.
      const to = date.to || date.from;
      const toInUTC = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()));
      
      const entryDateAtMidnight = new Date(entryDate.setUTCHours(0, 0, 0, 0));

      return entryDateAtMidnight >= fromInUTC && entryDateAtMidnight <= toInUTC;
    });

    const finalFiltered = filteredByDate.filter(entry => {
      return (Object.keys(filters) as Array<keyof LeasingFilter>).every(key => {
        const filterValue = filters[key];
        if (!filterValue) return true;

        if (key === 'week') {
          return entry.week.toString().includes(filterValue);
        }
        
        if (key === 'date') {
          // Allow filtering by a part of the date string e.g. "2025-06"
          return entry.date.includes(filterValue);
        }

        const entryValue = entry[key as keyof LeasingEntry];
        if (typeof entryValue === 'string') {
          return entryValue.toLowerCase().includes(filterValue.toLowerCase());
        }
        
        return true;
      });
    });

    setFilteredData(finalFiltered);
  }, [data, date, filters]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.key === 'week') {
          if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        if (sortConfig.key === 'date') {
          const dateA = new Date(aValue).getTime();
          const dateB = new Date(bValue).getTime();
          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        // Default to string comparison
        if (String(aValue).toLowerCase() < String(bValue).toLowerCase()) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (String(aValue).toLowerCase() > String(bValue).toLowerCase()) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const handleSort = (key: keyof LeasingEntry) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleAddNew = () => {
    setEntryToEdit(null);
    setIsAddEditDialogOpen(true);
  };

  const handleEdit = (entry: LeasingEntry) => {
    setEntryToEdit(entry);
    setIsAddEditDialogOpen(true);
  };
  
  const handleDelete = (entry: LeasingEntry) => {
    setEntryToDelete(entry);
  };

  const handleSave = (entry: LeasingEntry) => {
    if (entryToEdit) {
      setData(data.map((item) => (item.id === entry.id ? entry : item)));
    } else {
      setData([entry, ...data]);
    }
    setIsAddEditDialogOpen(false);
    setEntryToEdit(null);
  };
  
  const confirmDelete = () => {
    if (entryToDelete) {
      setData(data.filter((item) => item.id !== entryToDelete.id));
      setEntryToDelete(null);
    }
  };

  const handleApplyFilters = () => {
    setFilters(tempFilters);
    setIsFilterPopoverOpen(false);
  };

  const handleResetFilters = () => {
    setFilters({});
    setTempFilters({});
    setIsFilterPopoverOpen(false);
  };

  const handleFilterPopoverOpenChange = (open: boolean) => {
    if (open) {
      setTempFilters(filters);
    }
    setIsFilterPopoverOpen(open);
  }

  const handleTempFilterChange = (key: keyof LeasingFilter, value: string) => {
    setTempFilters(prev => ({...prev, [key]: value}));
  }

  const handleSaveToLocal = () => {
    try {
        window.localStorage.setItem('leasingData', JSON.stringify(data));
        toast({
            title: "Data Saved",
            description: "Your leasing data has been saved to your browser.",
        });
    } catch (error) {
        console.error("Failed to save data to localStorage", error);
        toast({
            variant: "destructive",
            title: "Save Failed",
            description: "There was an error saving your data.",
        });
    }
  };

  const handleDownload = () => {
    const headers = [
      'id', 'week', 'date', 'tenantName', 'businessName',
      'businessType', 'contact', 'notes', 'status'
    ];
    
    // Use a copy of the data where the date is formatted as YYYY-MM-DD
    const dataToExport = sortedData.map(entry => ({
      ...entry,
      date: format(new Date(entry.date), 'yyyy-MM-dd')
    }));

    const csv = Papa.unparse({
        fields: headers,
        data: dataToExport
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-t8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `leasing_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        try {
          const uploadedData: LeasingEntry[] = results.data.map((row: any) => {
            if (!row.date || !row.tenantName) {
              throw new Error(`Row is missing required fields (date, tenantName): ${JSON.stringify(row)}`);
            }
            
            const date = new Date(row.date);
            if(isNaN(date.getTime())) throw new Error(`Invalid date format for row: ${JSON.stringify(row)}`);

            const week = parseInt(row.week, 10);
            if(isNaN(week)) throw new Error(`Invalid week format for row: ${JSON.stringify(row)}`);

            return {
              id: row.id || uuidv4(),
              week: week,
              date: date.toISOString(),
              tenantName: row.tenantName || '',
              businessName: row.businessName || '',
              businessType: row.businessType || '',
              contact: row.contact || '',
              notes: row.notes || '',
              status: row.status || '',
            };
          });
          
          setData(uploadedData);

          toast({
            title: "Upload Successful",
            description: `${uploadedData.length} entries loaded. Click 'Save' to persist changes.`,
          });
        } catch (error: any) {
          console.error("CSV Parsing Error:", error);
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: error.message || "Could not parse the CSV file. Please check the format.",
          });
        }
      },
      error: function(error: any) {
          console.error("File Read Error:", error);
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: "Could not read the file.",
          });
      }
    });

    if(event.target) {
      event.target.value = '';
    }
  };

  const handleExportXLSX = () => {
    const reportTitle = uiText.reportTitle;
    const reportPeriod = date?.from
      ? date.to
        ? `Period: ${format(date.from, "d MMMM yyyy")} - ${format(date.to, "d MMMM yyyy")}`
        : `Period: ${format(date.from, "d MMMM yyyy")}`
      : "Period: All Data";
    const staffNameLine = `${uiText.staffNameLabel} ${staffName}`;

    const headers = [
      uiText.tableHeaderNo, uiText.tableHeaderWeek, uiText.tableHeaderDate, uiText.tableHeaderTenantName, 
      uiText.tableHeaderBusinessName, uiText.tableHeaderBusinessType, uiText.tableHeaderContact, 
      uiText.tableHeaderNotes, uiText.tableHeaderStatus
    ];
    const dataToExport = sortedData.map((entry, index) => ([
      index + 1,
      entry.week,
      format(new Date(entry.date), 'dd/MM/yyyy'),
      entry.tenantName,
      entry.businessName,
      entry.businessType,
      entry.contact,
      entry.notes || '',
      entry.status || '',
    ]));
    
    const headerCount = headers.length;
    
    const worksheetData = [
      [reportTitle, ...Array(headerCount - 1).fill('')],
      [], 
      [reportPeriod],
      [staffNameLine],
      [], 
      headers,
      ...dataToExport
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    const allBorders = {
      top: { style: "thin" as const, color: { rgb: "000000" } },
      bottom: { style: "thin" as const, color: { rgb: "000000" } },
      left: { style: "thin" as const, color: { rgb: "000000" } },
      right: { style: "thin" as const, color: { rgb: "000000" } },
    };

    const reportTitleStyle = { 
      font: { name: "Arial", sz: 16, bold: true },
      alignment: { horizontal: "center" as const, vertical: "center" as const }
    };

    const infoStyle = { 
      font: { name: "Arial", sz: 12 },
      alignment: { horizontal: "left" as const, vertical: "center" as const }
    };

    const headerStyle = { 
      font: { name: "Arial", sz: 10, bold: true },
      alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
      border: allBorders,
      fill: { fgColor: { rgb: "E6E6E6" } }
    };
    
    const baseCellStyle = {
      font: { name: "Arial", sz: 8 },
      border: allBorders,
      alignment: { vertical: "top" as const, wrapText: true }
    };

    const centerAlignedCellStyle = {
      ...baseCellStyle,
      alignment: { ...baseCellStyle.alignment, horizontal: "center" as const }
    };
    
    const leftAlignedCellStyle = {
      ...baseCellStyle,
      alignment: { ...baseCellStyle.alignment, horizontal: "left" as const }
    };

    worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headerCount - 1 } }];
    if (worksheet['A1']) worksheet['A1'].s = reportTitleStyle;

    if (worksheet['A3']) worksheet['A3'].s = infoStyle;
    if (worksheet['A4']) worksheet['A4'].s = infoStyle;
    
    const headerRowIndex = 5;
    const dataStartRow = headerRowIndex + 1;
    const endRow = dataStartRow + dataToExport.length - 1;
    const endCol = headers.length - 1;

    for (let C = 0; C <= endCol; ++C) {
        const cellRef = XLSX.utils.encode_cell({r: headerRowIndex, c: C});
        if (worksheet[cellRef]) {
            worksheet[cellRef].s = headerStyle;
        }
    }

    for (let R = dataStartRow; R <= endRow; ++R) {
        for (let C = 0; C <= endCol; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!worksheet[cellRef]) {
                worksheet[cellRef] = { t: 's', v: '' };
            }
            
            const style = C < 3 ? centerAlignedCellStyle : leftAlignedCellStyle;
            worksheet[cellRef].s = style;
        }
    }
    
    worksheet['!cols'] = [
      { wch: 5 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 25 },
      { wch: 20 }, { wch: 20 }, { wch: 45 }, { wch: 45 },
    ];

    worksheet['!rows'] = [];
    worksheet['!rows'][0] = { hpt: 24 };
    worksheet['!rows'][2] = { hpt: 18 };
    worksheet['!rows'][3] = { hpt: 18 };
    worksheet['!rows'][headerRowIndex] = { hpt: 30 };

    for (let R = dataStartRow; R <= endRow; ++R) {
        worksheet['!rows'][R] = { hpt: 45 };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leasing Report");
    XLSX.writeFile(workbook, `leasing_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const generatePdfDoc = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const docFont = 'Helvetica';

    doc.setFont(docFont, 'bold');
    doc.setFontSize(16);
    doc.text(uiText.reportTitle, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    doc.setFont(docFont, 'normal');
    doc.setFontSize(12);
    const periodText = date?.from
      ? date.to
        ? `Period: ${format(date.from, "d MMMM yyyy")} - ${format(date.to, "d MMMM yyyy")}`
        : `Period: ${format(date.from, "d MMMM yyyy")}`
      : "Period: All Data";

    doc.text(periodText, 14, 30);
    doc.text(`${uiText.staffNameLabel} ${staffName}`, 14, 36);

    const tableColumn = [ 
        uiText.tableHeaderNo, uiText.tableHeaderWeek, uiText.tableHeaderDate, uiText.tableHeaderTenantName, 
        uiText.tableHeaderBusinessName, uiText.tableHeaderBusinessType, uiText.tableHeaderContact, 
        uiText.tableHeaderNotes, uiText.tableHeaderStatus
    ];
    const tableRows: (string|number)[][] = sortedData.map((entry, index) => ([
        index + 1,
        entry.week,
        format(new Date(entry.date), 'dd/MM/yyyy'),
        entry.tenantName,
        entry.businessName,
        entry.businessType,
        entry.contact,
        entry.notes,
        entry.status,
    ]));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 42,
      theme: 'grid',
      headStyles: {
          font: docFont,
          fontStyle: 'bold',
          fillColor: [230, 230, 230],
          textColor: [0, 0, 0],
          halign: 'center',
          lineColor: [0,0,0],
          lineWidth: 0.1,
      },
      styles: {
          font: docFont,
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: [0,0,0],
          lineWidth: 0.1,
      },
      columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'center', cellWidth: 10 },
          2: { halign: 'center', cellWidth: 18 },
      },
    });

    return doc;
  };

  const handleExportPDF = async () => {
    const doc = await generatePdfDoc();
    doc.save(`leasing_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleTranslate = async (languageName: string, languageCode: string) => {
    if (languageCode === 'en') {
      setUiText(defaultUiText);
      return;
    }
    
    setIsTranslating(true);
    const { id, update } = toast({
      description: `${uiText.translationInProgress}`,
    });
    
    try {
      const translatedContent = await translateContent({
        targetLanguage: languageName,
        content: defaultUiText,
      });
      setUiText(translatedContent as UiText);
      update({
        id,
        variant: "default",
        description: `${uiText.translationSuccess}`,
      });
    } catch (error) {
      console.error("Translation failed", error);
      update({
        id,
        variant: "destructive",
        description: `${uiText.translationError}`,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="p-8 font-sans text-xs">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-base font-bold uppercase">{uiText.reportTitle}</h1>
          <div className="text-sm mt-1 space-y-1">
            <Popover>
              <PopoverTrigger asChild>
                 <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[300px] justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y")} -{" "}
                        {format(date.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(date.from, "LLL dd, y")
                    )
                  ) : (
                    <span>{uiText.datePickerPlaceholder}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={setDate}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2 pt-1">
                <Label htmlFor="staff-name" className="whitespace-nowrap">{uiText.staffNameLabel}</Label>
                <Input
                    id="staff-name"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="h-8 w-[236px]"
                    autoComplete="off"
                />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={isTranslating}>
                  {isTranslating ? <Loader2 className="animate-spin" /> : <Languages />}
                  <span className="sr-only">Translate UI</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Translate to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {languages.map(lang => (
                    <DropdownMenuItem key={lang.code} onSelect={() => handleTranslate(lang.name, lang.code)}>
                        {lang.name}
                    </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleAddNew}>{uiText.addNewEntryButton}</Button>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <Popover open={isFilterPopoverOpen} onOpenChange={handleFilterPopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              {uiText.filterButton}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">{uiText.filterPopoverTitle}</h4>
                <p className="text-sm text-muted-foreground">
                  {uiText.filterPopoverDescription}
                </p>
              </div>
              <div className="grid gap-2 max-h-[50vh] overflow-y-auto p-1">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-week">{uiText.filterWeek}</Label>
                  <Input id="filter-week" value={tempFilters.week || ''} onChange={(e) => handleTempFilterChange('week', e.target.value)} className="col-span-2 h-8" type="number" autoComplete="off" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-date">{uiText.filterDate}</Label>
                  <Input id="filter-date" value={tempFilters.date || ''} onChange={(e) => handleTempFilterChange('date', e.target.value)} placeholder="YYYY-MM-DD" className="col-span-2 h-8" autoComplete="off" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-tenantName">{uiText.filterTenantName}</Label>
                  <Input id="filter-tenantName" value={tempFilters.tenantName || ''} onChange={(e) => handleTempFilterChange('tenantName', e.target.value)} className="col-span-2 h-8" autoComplete="off" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-businessName">{uiText.filterBusinessName}</Label>
                  <Input id="filter-businessName" value={tempFilters.businessName || ''} onChange={(e) => handleTempFilterChange('businessName', e.target.value)} className="col-span-2 h-8" autoComplete="off" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-businessType">{uiText.filterBusinessType}</Label>
                  <Input id="filter-businessType" value={tempFilters.businessType || ''} onChange={(e) => handleTempFilterChange('businessType', e.target.value)} className="col-span-2 h-8" autoComplete="off" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="filter-contact">{uiText.filterContact}</Label>
                  <Input id="filter-contact" value={tempFilters.contact || ''} onChange={(e) => handleTempFilterChange('contact', e.target.value)} className="col-span-2 h-8" autoComplete="off" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleResetFilters}>{uiText.filterResetButton}</Button>
                  <Button size="sm" onClick={handleApplyFilters}>{uiText.filterApplyButton}</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={handleSaveToLocal}>
          <Save className="mr-2 h-4 w-4" />
          {uiText.saveButton}
        </Button>
        <Button variant="outline" onClick={handleUploadClick}>
          <Upload className="mr-2 h-4 w-4" />
          {uiText.uploadButton}
        </Button>
        <Button variant="outline" onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          {uiText.downloadCsvButton}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {uiText.exportButton}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleExportXLSX}>{uiText.exportToXlsx}</DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF}>{uiText.exportToPdf}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          accept=".csv"
        />
      </div>

      <main>
        <LeasingDataTable
          data={sortedData}
          onEdit={handleEdit}
          onDelete={handleDelete}
          uiText={uiText}
          onSort={handleSort}
          sortConfig={sortConfig}
        />
      </main>
      <AddEditDialog
        isOpen={isAddEditDialogOpen}
        onOpenChange={(isOpen) => {
          setIsAddEditDialogOpen(isOpen);
          if (!isOpen) {
            setEntryToEdit(null);
          }
        }}
        onSave={handleSave}
        initialData={entryToEdit}
        uiText={uiText}
      />
      <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => !isOpen && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uiText.deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {uiText.deleteDialogDescription} {entryToDelete?.tenantName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEntryToDelete(null)}>{uiText.deleteDialogCancelButton}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {uiText.deleteDialogDeleteButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
