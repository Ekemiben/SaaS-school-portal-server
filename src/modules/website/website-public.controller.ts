import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { WebsiteService } from './website.service.js';
import { CreatePublicInquiryDto } from './dto/website.dto.js';

@Controller(['public/website', 'api/v1/public/website'])
@Public()
export class WebsitePublicController {
  constructor(
    private readonly websiteService: WebsiteService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(req: any): Promise<string> {
    if (req.tenantId) {
      return req.tenantId;
    }
    if (req.tenantContext?.tenantId) {
      return req.tenantContext.tenantId;
    }

    const headerId = req.headers['x-tenant-id'] as string;
    if (headerId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: headerId } });
      if (tenant) return tenant.id;
    }

    const headerSlug = req.headers['x-tenant-slug'] as string;
    if (headerSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: headerSlug } });
      if (tenant) return tenant.id;
    }

    const querySlug = req.query?.tenantSlug as string;
    if (querySlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: querySlug } });
      if (tenant) return tenant.id;
    }

    throw new NotFoundException('School tenant not found or missing tenant resolution context');
  }

  @Get('config')
  async getConfig(@Req() req: any) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicConfig(tenantId);
  }

  @Get('pages')
  async getPages(@Req() req: any) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicPages(tenantId);
  }

  @Get('pages/:slug')
  async getPageBySlug(@Req() req: any, @Param('slug') slug: string) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicPageBySlug(tenantId, slug);
  }

  @Get('news')
  async getNews(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const tenantId = await this.resolveTenantId(req);
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedPage = page ? parseInt(page, 10) : 1;
    return this.websiteService.getPublicNews(tenantId, category, parsedLimit, parsedPage);
  }

  @Get('news/:slug')
  async getNewsBySlug(@Req() req: any, @Param('slug') slug: string) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicNewsBySlug(tenantId, slug);
  }

  @Get('events')
  async getEvents(@Req() req: any, @Query('upcoming') upcoming?: string) {
    const tenantId = await this.resolveTenantId(req);
    const upcomingOnly = upcoming === 'true' || upcoming === '1';
    return this.websiteService.getPublicEvents(tenantId, upcomingOnly);
  }

  @Get('events/:slug')
  async getEventBySlug(@Req() req: any, @Param('slug') slug: string) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicEventBySlug(tenantId, slug);
  }

  @Get('announcements')
  async getAnnouncements(@Req() req: any) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicAnnouncements(tenantId);
  }

  @Get('gallery')
  async getGallery(@Req() req: any, @Query('album') album?: string) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.getPublicGallery(tenantId, album);
  }

  @Post('inquiries')
  async submitInquiry(@Req() req: any, @Body() dto: CreatePublicInquiryDto) {
    const tenantId = await this.resolveTenantId(req);
    return this.websiteService.submitPublicInquiry(tenantId, dto);
  }
}
